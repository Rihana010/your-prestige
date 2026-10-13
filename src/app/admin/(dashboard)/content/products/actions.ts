"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import type { ListParams, ListResult } from "@/hooks/useAdminList";
import { productSchema, type ProductInput } from "./schema";
import type { Prisma } from "@prisma/client";
import { safeOrderBy, safePaging } from "@/lib/list-params";
import { resolveImageRef } from "@/lib/s3-url";
import { revalidateProduct } from "@/lib/revalidate-content";
import { PRODUCT_INCLUDE } from "@/lib/products";
import { getCategorySubtreeIds } from "@/lib/category-tree";

export type ProductRow = Prisma.ProductGetPayload<{
  include: { category: { select: { name: true } }; brand: { select: { name: true } } };
}> & {
  /**
   * List thumbnail, resolved server-side. Depot-imported products hold their
   * photography as an S3 object key in `image_key`, so a row rendered straight
   * from `lifestyleImage` showed an empty grey square in the CMS.
   */
  thumbUrl: string | null;
};

export interface ProductListParams extends ListParams {
  brandId?: string;
  categoryId?: string;
  /** ACTIVE | DRAFT | ARCHIVED */
  status?: string;
  /** Only products with no brand or no category — the ones needing assignment. */
  unassigned?: boolean;
}

export async function listProducts(params: ProductListParams): Promise<ListResult<ProductRow>> {
  await requirePermission("products", "view");

  const search = params.search?.trim();
  const status = ["ACTIVE", "DRAFT", "ARCHIVED"].find((s) => s === params.status);

  const and: Prisma.ProductWhereInput[] = [];
  if (params.brandId) and.push({ brandId: params.brandId });
  if (params.categoryId) {
    // A category filter means that category *and everything under it*, the same
    // rule the public site uses — filtering to "Faucets" should include its subcategories.
    const cat = await prisma.category.findUnique({ where: { id: params.categoryId }, select: { slug: true } });
    const subtree = cat ? await getCategorySubtreeIds(cat.slug) : [];
    and.push({ categoryId: { in: subtree.length ? subtree : [params.categoryId] } });
  }
  if (status) and.push({ status });
  if (params.unassigned) and.push({ OR: [{ brandId: null }, { categoryId: null }] });

  const where: Prisma.ProductWhereInput = {
    deletedAt: params.trash ? { not: null } : null,
    ...(and.length ? { AND: and } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
            { collection: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { productCode: { contains: search, mode: "insensitive" } },
            { variants: { some: { sku: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: { select: { name: true } }, brand: { select: { name: true } } },
      orderBy: safeOrderBy("Product", params.sortBy, params.sortDir, "createdAt"),
      ...safePaging(params.page, params.pageSize),
    }),
    prisma.product.count({ where }),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      thumbUrl:
        resolveImageRef(row.lifestyleImage) ||
        resolveImageRef(row.image_key) ||
        resolveImageRef(row.thumbnail_key),
    })),
    total,
  };
}

export async function getProductFormOptions(excludeId?: string) {
  await requirePermission("products", "view");
  const [categoryRows, brands, collections, products] = await Promise.all([
    prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, parentId: true, brandId: true },
      orderBy: { name: "asc" },
    }),
    prisma.brand.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.collection.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Present the category tree as indented paths ("Bathware › Faucets › Basin
  // Mixers") so picking a subcategory is one obvious choice rather than a flat
  // list of ambiguous leaf names — there are several "Accessories".
  const byId = new Map(categoryRows.map((c) => [c.id, c]));
  const pathOf = (id: string): string => {
    const parts: string[] = [];
    const guard = new Set<string>();
    let cursor = byId.get(id);
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      parts.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return parts.join(" › ");
  };

  const categories = categoryRows
    .map((c) => ({ id: c.id, name: pathOf(c.id), brandId: c.brandId }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { categories, brands, collections, products };
}

/**
 * A category that belongs to a brand only takes that brand's products. Without
 * this, assigning "Jaquar Faucets" to a Kohler product would succeed and the
 * product would surface on the wrong brand's page. Shared categories
 * (brandId = null) accept anything, exactly as before.
 */
async function assertCategoryMatchesBrand(categoryId?: string | null, brandId?: string | null) {
  if (!categoryId) return;
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { name: true, brandId: true, brand: { select: { name: true } } },
  });
  if (!category?.brandId) return;
  if (brandId !== category.brandId) {
    throw new Error(
      `"${category.name}" belongs to ${category.brand?.name ?? "another brand"}. Choose that brand for this product, or pick a different category.`
    );
  }
}

/**
 * Stops the two duplicate cases that otherwise only show up later as a raw
 * database error or two identical-looking cards on the site:
 *  - the same SKU on another live product (SKU is unique in the database);
 *  - the same name under the same brand and category (should be a variant).
 * On edit, only re-checks what actually changed, so a product that was already
 * a duplicate before this check existed can still be edited for other reasons.
 */
async function assertNoDuplicateProduct(
  data: { name: string; sku?: string | null; brandId?: string | null; categoryId?: string | null },
  before?: { id: string; name: string; sku: string | null; brandId: string | null; categoryId: string | null }
) {
  const sku = data.sku?.trim();
  if (sku && sku !== before?.sku) {
    const clash = await prisma.product.findFirst({
      where: { sku, ...(before ? { id: { not: before.id } } : {}) },
      select: { name: true, deletedAt: true },
    });
    if (clash) {
      throw new Error(
        `SKU "${sku}" is already used by "${clash.name}"${clash.deletedAt ? " (in trash)" : ""}. Add this as a variant of that product instead, or use a different SKU.`
      );
    }
  }

  const changed =
    !before ||
    before.name.trim().toLowerCase() !== data.name.trim().toLowerCase() ||
    (before.brandId ?? null) !== (data.brandId || null) ||
    (before.categoryId ?? null) !== (data.categoryId || null);
  if (changed) {
    const same = await prisma.product.findFirst({
      where: {
        deletedAt: null,
        name: { equals: data.name.trim(), mode: "insensitive" },
        brandId: data.brandId || null,
        categoryId: data.categoryId || null,
        ...(before ? { id: { not: before.id } } : {}),
      },
      select: { name: true },
    });
    if (same) {
      throw new Error(
        `"${same.name}" already exists under this brand and category. If it is another size or finish, add it as a variant of that product.`
      );
    }
  }
}

export async function createProduct(input: ProductInput) {
  const session = await requirePermission("products", "create");
  const data = productSchema.parse(input);
  await assertCategoryMatchesBrand(data.categoryId, data.brandId);
  await assertNoDuplicateProduct(data);

  const existing = await prisma.product.findUnique({ where: { slug: data.slug } });
  if (existing) throw new Error("A product with this slug already exists.");

  const product = await prisma.product.create({
    data: {
      ...data,
      sku: data.sku?.trim() || null,
      productCode: data.productCode?.trim() || null,
      collection: data.collection || null,
      description: data.description || null,
      finish: data.finish || null,
      thickness: data.thickness || null,
      material: data.material || null,
      color: data.color || null,
      texture: data.texture || null,
      lifestyleImage: data.lifestyleImage || null,
      textureImage: data.textureImage || null,
      video: data.video || null,
      brochureUrl: data.brochureUrl || null,
      tag: data.tag || null,
      priceIndicator: data.priceIndicator || null,
      categoryId: data.categoryId || null,
      brandId: data.brandId || null,
      collectionId: data.collectionId || null,
      // A person chose this placement, so nothing is waiting on it.
      needsReview: false,
      reviewReason: null,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });

  await logAudit({ action: "product.create", entity: "Product", entityId: product.id, newValue: product });
  await revalidateProductById(product.id);
  return product;
}

export async function updateProduct(id: string, input: ProductInput) {
  const session = await requirePermission("products", "edit");
  const data = productSchema.parse(input);
  await assertCategoryMatchesBrand(data.categoryId, data.brandId);

  const before = await prisma.product.findUniqueOrThrow({ where: { id } });
  await assertNoDuplicateProduct(data, before);
  const duplicate = await prisma.product.findFirst({ where: { slug: data.slug, id: { not: id } } });
  if (duplicate) throw new Error("A product with this slug already exists.");

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...data,
      sku: data.sku?.trim() || null,
      productCode: data.productCode?.trim() || null,
      collection: data.collection || null,
      description: data.description || null,
      finish: data.finish || null,
      thickness: data.thickness || null,
      material: data.material || null,
      color: data.color || null,
      texture: data.texture || null,
      lifestyleImage: data.lifestyleImage || null,
      textureImage: data.textureImage || null,
      video: data.video || null,
      brochureUrl: data.brochureUrl || null,
      tag: data.tag || null,
      priceIndicator: data.priceIndicator || null,
      categoryId: data.categoryId || null,
      brandId: data.brandId || null,
      collectionId: data.collectionId || null,
      needsReview: false,
      reviewReason: null,
      updatedById: session.user.id,
    },
  });

  await logAudit({ action: "product.update", entity: "Product", entityId: id, oldValue: before, newValue: product });
  // Media and copy changes have to reach the public page now, not in an hour.
  await revalidateProductById(id);
  return product;
}

export async function softDeleteProduct(id: string) {
  const session = await requirePermission("products", "delete");
  const product = await prisma.product.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: session.user.id },
  });
  await logAudit({ action: "product.delete", entity: "Product", entityId: id });
  return product;
}

export async function restoreProduct(id: string) {
  await requirePermission("products", "edit");
  const product = await prisma.product.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
  await logAudit({ action: "product.restore", entity: "Product", entityId: id });
  return product;
}

export async function bulkDeleteProducts(ids: string[]) {
  const session = await requirePermission("products", "delete");
  await prisma.product.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt: new Date(), deletedById: session.user.id },
  });
  await logAudit({ action: "product.bulk_delete", entity: "Product", meta: { ids } });
}

const BULK_LIMIT = 500;

/**
 * Re-files many products at once. Every product is checked against the brand
 * and category it would end up with, so a bulk move can't smuggle a product
 * into another brand's category any more than the edit form can. All-or-nothing:
 * one bad product means nothing is changed.
 */
export async function bulkAssignProducts(
  ids: string[],
  target: { brandId?: string | null; categoryId?: string | null }
) {
  const session = await requirePermission("products", "edit");
  const unique = [...new Set(ids)].slice(0, BULK_LIMIT);
  if (unique.length === 0) throw new Error("Select at least one product.");
  if (target.brandId === undefined && target.categoryId === undefined) {
    throw new Error("Choose a brand or a category to assign.");
  }

  const products = await prisma.product.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: { id: true, name: true, brandId: true, categoryId: true },
  });

  const [brand, category] = await Promise.all([
    target.brandId ? prisma.brand.findFirst({ where: { id: target.brandId, deletedAt: null }, select: { id: true } }) : null,
    target.categoryId
      ? prisma.category.findFirst({
          where: { id: target.categoryId, deletedAt: null },
          select: { id: true, name: true, brandId: true, brand: { select: { name: true } } },
        })
      : null,
  ]);
  if (target.brandId && !brand) throw new Error("The selected brand no longer exists.");
  if (target.categoryId && !category) throw new Error("The selected category no longer exists.");

  const problems: string[] = [];
  for (const p of products) {
    const nextBrand = target.brandId !== undefined ? target.brandId : p.brandId;
    if (category?.brandId && nextBrand !== category.brandId) {
      problems.push(p.name);
    }
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, 3).map((n) => `"${n}"`).join(", ");
    throw new Error(
      `"${category?.name}" belongs to ${category?.brand?.name ?? "another brand"}. ${problems.length} selected product${problems.length === 1 ? "" : "s"} (${shown}${problems.length > 3 ? ", …" : ""}) would not match it. Set the brand too, or pick a different category.`
    );
  }

  await prisma.product.updateMany({
    where: { id: { in: products.map((p) => p.id) } },
    data: {
      ...(target.brandId !== undefined ? { brandId: target.brandId } : {}),
      ...(target.categoryId !== undefined ? { categoryId: target.categoryId } : {}),
      // A person chose this placement, so nothing is waiting on it.
      needsReview: false,
      reviewReason: null,
      updatedById: session.user.id,
    },
  });

  await logAudit({ action: "product.bulk_assign", entity: "Product", meta: { ids: products.map((p) => p.id), target } });
  await revalidateMany(products.map((p) => p.id));
  return { updated: products.length };
}

/** Publish / draft / hide many products at once. `published` stays in lockstep with `status`. */
export async function bulkSetProductStatus(ids: string[], status: "ACTIVE" | "DRAFT" | "ARCHIVED") {
  const session = await requirePermission("products", "edit");
  if (!["ACTIVE", "DRAFT", "ARCHIVED"].includes(status)) throw new Error("Invalid status.");
  const unique = [...new Set(ids)].slice(0, BULK_LIMIT);
  if (unique.length === 0) throw new Error("Select at least one product.");

  const result = await prisma.product.updateMany({
    where: { id: { in: unique }, deletedAt: null },
    data: { status, published: status === "ACTIVE", updatedById: session.user.id },
  });

  await logAudit({ action: "product.bulk_status", entity: "Product", meta: { ids: unique, status } });
  await revalidateMany(unique);
  return { updated: result.count };
}

/** Refresh public pages for many products, a few at a time so a big selection doesn't open hundreds of queries at once. */
async function revalidateMany(ids: string[]) {
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(ids.slice(i, i + 10).map((id) => revalidateProductById(id)));
  }
}

/**
 * Refresh every cached page this product appears on.
 *
 * Re-reads the product with its category ancestry because the pages to
 * invalidate depend on which section it resolves to — the same rule the
 * canonical URL uses.
 */
async function revalidateProductById(id: string) {
  const row = await prisma.product.findUnique({
    where: { id },
    select: { slug: true, designerPick: true, ...PRODUCT_INCLUDE, brand: { select: { slug: true } } },
  });
  if (row) revalidateProduct(row);
}
