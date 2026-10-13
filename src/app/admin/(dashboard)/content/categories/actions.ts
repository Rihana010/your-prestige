"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { revalidateCategory } from "@/lib/revalidate-content";
import type { ListParams, ListResult } from "@/hooks/useAdminList";
import { categorySchema, type CategoryInput } from "./schema";
import type { Prisma } from "@prisma/client";
import { safeOrderBy, safePaging } from "@/lib/list-params";

export type CategoryRow = Prisma.CategoryGetPayload<{
  include: {
    parent: { select: { name: true } };
    brand: { select: { name: true } };
    _count: { select: { products: true; children: true } };
  };
}>;

export async function listCategories(params: ListParams): Promise<ListResult<CategoryRow>> {
  await requirePermission("categories", "view");

  const where: Prisma.CategoryWhereInput = {
    deletedAt: params.trash ? { not: null } : null,
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: "insensitive" } },
            { slug: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.category.findMany({
      where,
      include: {
        parent: { select: { name: true } },
        brand: { select: { name: true } },
        _count: { select: { products: true, children: true } },
      },
      orderBy: safeOrderBy("Category", params.sortBy, params.sortDir, "sortOrder"),
      ...safePaging(params.page, params.pageSize),
    }),
    prisma.category.count({ where }),
  ]);

  return { rows, total };
}

export async function getCategoryOptions(excludeId?: string) {
  await requirePermission("categories", "view");
  const categories = await prisma.category.findMany({
    where: { deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true, parentId: true, brandId: true },
    orderBy: { name: "asc" },
  });
  return categories;
}

/** Brands a category can be assigned to. */
export async function getBrandOptions() {
  await requirePermission("categories", "view");
  return prisma.brand.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Relationship rules for a category, enforced here because the database does
 * not (and, being additive-only, cannot be made to):
 *
 *  - a category cannot sit under itself or under one of its own descendants;
 *  - a subcategory of a brand's category belongs to that same brand;
 *  - moving a category to a brand is refused while it holds another brand's
 *    products — they would silently end up filed under the wrong brand.
 *
 * Returns the brandId to store, which is the parent's brand when the parent
 * has one.
 */
async function resolveCategoryRelations(
  data: { parentId?: string | null; brandId?: string | null },
  id?: string
): Promise<string | null> {
  let brandId = data.brandId || null;

  if (data.parentId) {
    // Walk up from the proposed parent; reaching this category means a cycle.
    let cursor: string | null = data.parentId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      if (id && cursor === id) throw new Error("A category cannot be placed under one of its own subcategories.");
      seen.add(cursor);
      const node: { parentId: string | null } | null = await prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = node?.parentId ?? null;
    }

    const parent = await prisma.category.findUnique({
      where: { id: data.parentId },
      select: { brandId: true, brand: { select: { name: true } } },
    });
    if (!parent) throw new Error("The selected parent category no longer exists.");
    if (parent.brandId) {
      if (brandId && brandId !== parent.brandId) {
        throw new Error(`The parent category belongs to ${parent.brand?.name}; a subcategory must belong to the same brand.`);
      }
      brandId = parent.brandId;
    }
  }

  if (id && brandId) {
    const foreign = await prisma.product.count({
      where: { categoryId: id, deletedAt: null, OR: [{ brandId: { not: brandId } }, { brandId: null }] },
    });
    if (foreign > 0) {
      throw new Error(
        `${foreign === 1 ? "1 product in this category belongs" : `${foreign} products in this category belong`} to another brand (or none). Move ${foreign === 1 ? "it" : "them"} first, or leave the category shared.`
      );
    }
  }

  return brandId;
}

export async function createCategory(input: CategoryInput) {
  const session = await requirePermission("categories", "create");
  const data = categorySchema.parse(input);

  const existing = await prisma.category.findUnique({ where: { slug: data.slug } });
  if (existing) throw new Error("A category with this slug already exists.");

  const brandId = await resolveCategoryRelations(data);

  const category = await prisma.category.create({
    data: {
      ...data,
      image: data.image || null,
      bannerImage: data.bannerImage || null,
      icon: data.icon || null,
      video: data.video || null,
      videoPoster: data.videoPoster || null,
      brandId,
      description: data.description || null,
      parentId: data.parentId || null,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });

  await logAudit({ action: "category.create", entity: "Category", entityId: category.id, newValue: category });
  await revalidateCategoryById(category.id);
  return category;
}

export async function updateCategory(id: string, input: CategoryInput) {
  const session = await requirePermission("categories", "edit");
  const data = categorySchema.parse(input);

  if (data.parentId === id) throw new Error("A category cannot be its own parent.");

  const before = await prisma.category.findUniqueOrThrow({ where: { id } });
  const duplicate = await prisma.category.findFirst({ where: { slug: data.slug, id: { not: id } } });
  if (duplicate) throw new Error("A category with this slug already exists.");

  const brandId = await resolveCategoryRelations(data, id);

  const category = await prisma.category.update({
    where: { id },
    data: {
      ...data,
      image: data.image || null,
      bannerImage: data.bannerImage || null,
      icon: data.icon || null,
      video: data.video || null,
      videoPoster: data.videoPoster || null,
      brandId,
      description: data.description || null,
      parentId: data.parentId || null,
      updatedById: session.user.id,
    },
  });

  await logAudit({
    action: "category.update",
    entity: "Category",
    entityId: id,
    oldValue: before,
    newValue: category,
  });
  await revalidateCategoryById(id);
  return category;
}

export async function softDeleteCategory(id: string) {
  const session = await requirePermission("categories", "delete");

  // Deleting a category that still has contents would strand them: products
  // fall to "uncategorised" and subcategories to the top level. Refuse and say why.
  const [products, children] = await Promise.all([
    prisma.product.count({ where: { categoryId: id, deletedAt: null } }),
    prisma.category.count({ where: { parentId: id, deletedAt: null } }),
  ]);
  if (products > 0 || children > 0) {
    const parts = [
      products > 0 ? `${products} product${products === 1 ? "" : "s"}` : null,
      children > 0 ? `${children} subcategor${children === 1 ? "y" : "ies"}` : null,
    ].filter(Boolean);
    throw new Error(`This category still has ${parts.join(" and ")}. Move or remove them before deleting it.`);
  }

  const category = await prisma.category.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: session.user.id },
  });
  await logAudit({ action: "category.delete", entity: "Category", entityId: id });
  return category;
}

/** Swaps `sortOrder` with the adjacent sibling *within the same parent* — a bathware child reorders independently of top-level categories. */
/**
 * Moves a category one place up or down among its siblings (same parent, same
 * brand scope). Renumbers the siblings 0..n-1 first, because swapping
 * `sortOrder` values does nothing while they are all the default 0.
 */
export async function reorderCategory(id: string, direction: "up" | "down") {
  const session = await requirePermission("categories", "edit");

  const current = await prisma.category.findUniqueOrThrow({
    where: { id },
    select: { id: true, parentId: true, brandId: true },
  });
  const siblings = await prisma.category.findMany({
    where: { deletedAt: null, parentId: current.parentId, brandId: current.brandId },
    select: { id: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const from = siblings.findIndex((c) => c.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= siblings.length) return current;

  const ids = siblings.map((c) => c.id);
  [ids[from], ids[to]] = [ids[to], ids[from]];

  await prisma.$transaction(
    ids.map((catId, index) =>
      prisma.category.update({ where: { id: catId }, data: { sortOrder: index, updatedById: session.user.id } })
    )
  );

  await logAudit({ action: "category.reorder", entity: "Category", entityId: id, meta: { direction } });
  await revalidateCategoryById(id);
  return current;
}

export async function restoreCategory(id: string) {
  const session = await requirePermission("categories", "edit");
  const category = await prisma.category.update({
    where: { id },
    data: { deletedAt: null, deletedById: null },
  });
  await logAudit({ action: "category.restore", entity: "Category", entityId: id, meta: { by: session.user.id } });
  return category;
}

/** Refresh the section pages a category's imagery appears on. */
async function revalidateCategoryById(id: string) {
  const row = await prisma.category.findUnique({
    where: { id },
    select: { slug: true, parent: { select: { slug: true, parent: { select: { slug: true } } } } },
  });
  if (!row) return;
  const section = row.parent?.parent?.slug ?? row.parent?.slug ?? row.slug;
  revalidateCategory(row.slug, section);
}
