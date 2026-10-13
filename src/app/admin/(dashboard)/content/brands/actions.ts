"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { revalidateBrand } from "@/lib/revalidate-content";
import type { ListParams, ListResult } from "@/hooks/useAdminList";
import { brandSchema, type BrandInput } from "./schema";
import type { Prisma } from "@prisma/client";
import { safeOrderBy, safePaging } from "@/lib/list-params";

export type BrandRow = Prisma.BrandGetPayload<{ include: { _count: { select: { products: true } } } }> & {
  categoryCount: number;
};

export async function listBrands(params: ListParams): Promise<ListResult<BrandRow>> {
  await requirePermission("brands", "view");

  const where: Prisma.BrandWhereInput = {
    deletedAt: params.trash ? { not: null } : null,
    ...(params.search
      ? { OR: [{ name: { contains: params.search, mode: "insensitive" } }, { slug: { contains: params.search, mode: "insensitive" } }] }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.brand.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: safeOrderBy("Brand", params.sortBy, params.sortDir, "sortOrder"),
      ...safePaging(params.page, params.pageSize),
    }),
    prisma.brand.count({ where }),
  ]);

  const categoryRows = rows.length
    ? await prisma.product.groupBy({
        by: ["brandId", "categoryId"],
        where: { deletedAt: null, brandId: { in: rows.map((r) => r.id) }, categoryId: { not: null } },
      })
    : [];
  const distinctCategoriesByBrand = new Map<string, Set<string>>();
  for (const r of categoryRows) {
    if (!r.brandId || !r.categoryId) continue;
    if (!distinctCategoriesByBrand.has(r.brandId)) distinctCategoriesByBrand.set(r.brandId, new Set());
    distinctCategoriesByBrand.get(r.brandId)!.add(r.categoryId);
  }

  return {
    rows: rows.map((r) => ({ ...r, categoryCount: distinctCategoriesByBrand.get(r.id)?.size ?? 0 })),
    total,
  };
}

function toBrandData(data: BrandInput) {
  return {
    ...data,
    logo: data.logo || null,
    banner: data.banner || null,
    mobileCoverImage: data.mobileCoverImage || null,
    heroVideo: data.heroVideo || null,
    heroPoster: data.heroPoster || null,
    description: data.description || null,
    shortDescription: data.shortDescription || null,
    website: data.website || null,
    catalogPdf: data.catalogPdf || null,
    featuredProductIds: data.featuredProductIds,
  };
}

export async function createBrand(input: BrandInput) {
  const session = await requirePermission("brands", "create");
  const data = brandSchema.parse(input);

  const existing = await prisma.brand.findUnique({ where: { slug: data.slug } });
  if (existing) throw new Error("A brand with this slug already exists.");

  const brand = await prisma.brand.create({
    data: {
      ...toBrandData(data),
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });

  await logAudit({ action: "brand.create", entity: "Brand", entityId: brand.id, newValue: brand });
  revalidateBrand(brand.slug);
  return brand;
}

export async function updateBrand(id: string, input: BrandInput) {
  const session = await requirePermission("brands", "edit");
  const data = brandSchema.parse(input);

  const before = await prisma.brand.findUniqueOrThrow({ where: { id } });
  const duplicate = await prisma.brand.findFirst({ where: { slug: data.slug, id: { not: id } } });
  if (duplicate) throw new Error("A brand with this slug already exists.");

  const brand = await prisma.brand.update({
    where: { id },
    data: {
      ...toBrandData(data),
      updatedById: session.user.id,
    },
  });

  await logAudit({ action: "brand.update", entity: "Brand", entityId: id, oldValue: before, newValue: brand });
  // The logo, hero and poster all render from this record.
  revalidateBrand(brand.slug);
  if (before.slug !== brand.slug) revalidateBrand(before.slug);
  return brand;
}

/** This brand's own products, for the Featured Products checklist — never the whole catalogue. */
export async function getBrandProductOptions(brandId: string) {
  await requirePermission("brands", "view");
  return prisma.product.findMany({
    where: { brandId, deletedAt: null },
    select: { id: true, name: true, collection: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Moves a brand one place up or down.
 *
 * Swapping `sortOrder` with the neighbour only works when every brand already
 * has a distinct number — and they all default to 0, so on a fresh catalogue
 * the buttons silently did nothing. This renumbers the whole list 0..n-1 in its
 * current visible order first, then swaps, so it works from any starting state.
 */
export async function reorderBrand(id: string, direction: "up" | "down") {
  const session = await requirePermission("brands", "edit");

  const all = await prisma.brand.findMany({
    where: { deletedAt: null },
    select: { id: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const from = all.findIndex((b) => b.id === id);
  if (from === -1) throw new Error("Brand not found.");
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= all.length) return;

  const ids = all.map((b) => b.id);
  [ids[from], ids[to]] = [ids[to], ids[from]];

  await prisma.$transaction(
    ids.map((brandId, index) =>
      prisma.brand.update({ where: { id: brandId }, data: { sortOrder: index, updatedById: session.user.id } })
    )
  );

  await logAudit({ action: "brand.reorder", entity: "Brand", entityId: id, meta: { direction } });
  // Order shows on the brand index and in the shared mega-menu / footer.
  revalidatePath("/brands");
  revalidatePath("/");
}

export async function softDeleteBrand(id: string) {
  const session = await requirePermission("brands", "delete");

  // A brand that still owns products or categories would strand them: its
  // products lose their brand page and its categories fall back to "shared".
  // Refuse, and say what is in the way.
  const [products, categories, collections] = await Promise.all([
    prisma.product.count({ where: { brandId: id, deletedAt: null } }),
    prisma.category.count({ where: { brandId: id, deletedAt: null } }),
    prisma.collection.count({ where: { brandId: id, deletedAt: null } }),
  ]);
  if (products > 0 || categories > 0 || collections > 0) {
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const parts = [
      products > 0 ? plural(products, "product", "products") : null,
      categories > 0 ? plural(categories, "category", "categories") : null,
      collections > 0 ? plural(collections, "collection", "collections") : null,
    ].filter(Boolean);
    throw new Error(`This brand still has ${parts.join(", ")}. Move or remove them before deleting the brand.`);
  }

  const brand = await prisma.brand.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: session.user.id },
  });
  await logAudit({ action: "brand.delete", entity: "Brand", entityId: id });
  return brand;
}

export async function restoreBrand(id: string) {
  await requirePermission("brands", "edit");
  const brand = await prisma.brand.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
  await logAudit({ action: "brand.restore", entity: "Brand", entityId: id });
  return brand;
}
