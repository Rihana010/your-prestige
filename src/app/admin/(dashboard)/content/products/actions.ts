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

export async function listProducts(params: ListParams): Promise<ListResult<ProductRow>> {
  await requirePermission("products", "view");

  const where: Prisma.ProductWhereInput = {
    deletedAt: params.trash ? { not: null } : null,
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: "insensitive" } },
            { slug: { contains: params.search, mode: "insensitive" } },
            { collection: { contains: params.search, mode: "insensitive" } },
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
      select: { id: true, name: true, parentId: true },
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
    .map((c) => ({ id: c.id, name: pathOf(c.id) }))
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

export async function createProduct(input: ProductInput) {
  const session = await requirePermission("products", "create");
  const data = productSchema.parse(input);
  await assertCategoryMatchesBrand(data.categoryId, data.brandId);

  const existing = await prisma.product.findUnique({ where: { slug: data.slug } });
  if (existing) throw new Error("A product with this slug already exists.");

  const product = await prisma.product.create({
    data: {
      ...data,
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
  const duplicate = await prisma.product.findFirst({ where: { slug: data.slug, id: { not: id } } });
  if (duplicate) throw new Error("A product with this slug already exists.");

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...data,
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
