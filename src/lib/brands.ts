import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { brands as fallbackBrandNames } from "@/lib/demo-content";
import { toCatalogProduct, PRODUCT_INCLUDE, PUBLIC_PRODUCT_WHERE } from "@/lib/products";
import { getCategorySubtreeIds, getSubtreeProductCounts } from "@/lib/category-tree";
import { resolveImageRef } from "@/lib/s3-url";

/**
 * Brand directory, read from the CMS.
 *
 * Catalogue imports create Brand rows automatically (a PDF's running header is
 * usually the brand name), so this list grows on its own as ranges are
 * imported. Falls back to the bundled name list when the database is empty or
 * unreachable, matching how the product catalogue behaves.
 */

export interface BrandView {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  banner: string | null;
  mobileCoverImage: string | null;
  heroVideo: string | null;
  heroPoster: string | null;
  description: string | null;
  shortDescription: string | null;
  website: string | null;
  catalogPdf: string | null;
  featured: boolean;
  featuredProductIds: Prisma.JsonValue;
  productCount: number;
  /** Number of distinct categories this brand actually has published products in. */
  categoryCount: number;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const BRAND_VIEW_SELECT = {
  id: true,
  slug: true,
  name: true,
  logo: true,
  banner: true,
  mobileCoverImage: true,
  heroVideo: true,
  heroPoster: true,
  description: true,
  shortDescription: true,
  website: true,
  catalogPdf: true,
  featured: true,
  featuredProductIds: true,
} as const;

type BrandSelectRow = {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  banner: string | null;
  mobileCoverImage: string | null;
  heroVideo: string | null;
  heroPoster: string | null;
  description: string | null;
  shortDescription: string | null;
  website: string | null;
  catalogPdf: string | null;
  featured: boolean;
  featuredProductIds: Prisma.JsonValue;
};

/**
 * `Brand.logo`/`banner`/etc. hold whatever the upload path that wrote them
 * produced — an absolute URL from the current media system, but a bare S3
 * object key from anything that wrote the column before that existed
 * (`scripts/seed.mjs`, a hand-edited CMS value, an older import). Nothing
 * here ever ran that through `resolveImageRef`, unlike `products.ts` and
 * `collections.ts` — so a brand's logo or hero could render correctly on one
 * page and silently fail on another, purely depending on which code path
 * last wrote the column. Resolved once here, at the data boundary, the same
 * as the catalogue.
 */
function toBrandView(b: BrandSelectRow, productCount: number, categoryCount: number): BrandView {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    logo: resolveImageRef(b.logo),
    banner: resolveImageRef(b.banner),
    mobileCoverImage: resolveImageRef(b.mobileCoverImage),
    heroVideo: resolveImageRef(b.heroVideo),
    heroPoster: resolveImageRef(b.heroPoster),
    description: b.description,
    shortDescription: b.shortDescription,
    website: b.website,
    catalogPdf: b.catalogPdf,
    featured: b.featured,
    featuredProductIds: b.featuredProductIds,
    productCount,
    categoryCount,
  };
}

/** Distinct published-category count per brandId, in one grouped query — cheap even across every brand. */
async function categoryCountsByBrandId(): Promise<Map<string, number>> {
  const rows = await prisma.product.groupBy({
    by: ["brandId", "categoryId"],
    where: { ...PUBLIC_PRODUCT_WHERE, brandId: { not: null }, categoryId: { not: null } },
  });
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.brandId || !r.categoryId) continue;
    if (!seen.has(r.brandId)) seen.set(r.brandId, new Set());
    seen.get(r.brandId)!.add(r.categoryId);
  }
  return new Map([...seen.entries()].map(([brandId, cats]) => [brandId, cats.size]));
}

export const getBrands = cache(async (): Promise<BrandView[]> => {
  try {
    const [rows, categoryCounts] = await Promise.all([
      prisma.brand.findMany({
        where: { published: true, deletedAt: null },
        orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
        select: {
          ...BRAND_VIEW_SELECT,
          _count: { select: { products: { where: PUBLIC_PRODUCT_WHERE } } },
        },
      }),
      categoryCountsByBrandId(),
    ]);
    if (rows.length === 0) return fallbackBrands();

    return rows.map((b) => toBrandView(b, b._count.products, categoryCounts.get(b.id) ?? 0));
  } catch {
    return fallbackBrands();
  }
});

export const getBrandBySlug = cache(async (slug: string): Promise<BrandView | null> => {
  try {
    const b = await prisma.brand.findFirst({
      where: { slug, published: true, deletedAt: null },
      select: {
        ...BRAND_VIEW_SELECT,
        _count: { select: { products: { where: PUBLIC_PRODUCT_WHERE } } },
      },
    });
    if (!b) return null;

    const distinctCategories = await prisma.product.findMany({
      where: { brandId: b.id, ...PUBLIC_PRODUCT_WHERE, categoryId: { not: null } },
      distinct: ["categoryId"],
      select: { categoryId: true },
    });

    return toBrandView(b, b._count.products, distinctCategories.length);
  } catch {
    return null;
  }
});

/**
 * The real bathware category labels (Faucets, Showers, ...) — see
 * `getBrandCategories` below. Several brand-website imports (Jaquar, Artize,
 * Essco) stored this exact label in the legacy `collection` string column
 * before real `Category` rows existed for it. Now that `categoryId` carries
 * that meaning, a `collection` value identical to a category label is a
 * leftover duplicate, not a genuine named range — excluded here so the
 * "Collections" rail only ever surfaces true product ranges (Navia, Iris
 * Stone, ...).
 */
const CATEGORY_LABELS = new Set(
  [
    "Faucets", "Showers", "Sanitaryware", "Bath Fittings", "Wellness",
    "Flushing Systems", "Water Heaters", "Shower Enclosures", "Accessories", "Lighting",
  ].map((s) => s.toLowerCase())
);

/** Collections this brand has in the catalogue — the spine of its library page. */
export const getBrandCollections = cache(
  async (brandSlug: string): Promise<{ name: string; count: number }[]> => {
    try {
      const rows = await prisma.product.groupBy({
        by: ["collection"],
        where: { ...PUBLIC_PRODUCT_WHERE, brand: { slug: brandSlug } },
        _count: { _all: true },
      });
      return rows
        .filter((r): r is typeof r & { collection: string } => !!r.collection)
        .filter((r) => !CATEGORY_LABELS.has(r.collection.trim().toLowerCase()))
        .map((r) => ({ name: r.collection, count: r._count._all }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }
);

export interface BrandCategoryView {
  slug: string;
  name: string;
  count: number;
  image: string | null;
  description: string | null;
  /** Optional wide banner; null when the admin has not set one. */
  banner: string | null;
  /** Optional showcase video + its poster frame; both null when unset. */
  video: string | null;
  videoPoster: string | null;
  /** Slug of this category's parent, so a brand page can show Brand › Category › Subcategory. */
  parentSlug: string | null;
}

/** This brand's category breakdown — the spine of its `/brands/[slug]` navigation. */
export const getBrandCategories = cache(
  async (brandSlug: string): Promise<BrandCategoryView[]> => {
    try {
      const catSelect = {
        id: true,
        slug: true,
        name: true,
        image: true,
        bannerImage: true,
        video: true,
        videoPoster: true,
        description: true,
        sortOrder: true,
        parent: { select: { slug: true } },
      } as const;

      const brand = await prisma.brand.findUnique({ where: { slug: brandSlug }, select: { id: true } });
      if (!brand) return [];

      const [rows, owned] = await Promise.all([
        prisma.product.groupBy({
          by: ["categoryId"],
          where: { ...PUBLIC_PRODUCT_WHERE, brand: { slug: brandSlug } },
          _count: { _all: true },
        }),
        // Categories an admin created *for this brand*. Listed even while
        // empty, so a brand's structure is browsable (with a proper empty
        // state) before its products are filed.
        prisma.category.findMany({
          where: { brandId: brand.id, published: true, deletedAt: null },
          select: catSelect,
        }),
      ]);

      const productCategoryIds = rows.map((r) => r.categoryId).filter((id): id is string => !!id);
      const derived = productCategoryIds.length
        ? await prisma.category.findMany({
            where: { id: { in: productCategoryIds }, deletedAt: null },
            select: catSelect,
          })
        : [];

      const byId = new Map([...derived, ...owned].map((c) => [c.id, c]));
      const directCount = new Map(rows.map((r) => [r.categoryId, r._count._all]));

      // The page behind each chip lists the category's whole subtree, so the
      // chip counts it the same way. `groupBy` above only says which
      // categories this brand files products in — 48 brand/category pairs in
      // the catalogue have products on both a category and its children, and
      // those chips used to under-report.
      const allIds = [...byId.keys()];
      const subtreeCounts = allIds.length
        ? await getSubtreeProductCounts(allIds, brand.id)
        : new Map<string, number>();

      return allIds
        .map((id) => {
          const cat = byId.get(id)!;
          return {
            view: {
              slug: cat.slug,
              name: cat.name,
              count: Number(subtreeCounts.get(id) ?? directCount.get(id) ?? 0),
              image: resolveImageRef(cat.image),
              description: cat.description,
              banner: resolveImageRef(cat.bannerImage),
              video: cat.video,
              videoPoster: resolveImageRef(cat.videoPoster),
              parentSlug: cat.parent?.slug ?? null,
            } satisfies BrandCategoryView,
            sortOrder: cat.sortOrder,
          };
        })
        // Admin ordering first (all zeros today, so existing pages keep their
        // by-count order), then the old by-count / by-name rule as the tiebreak.
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || b.view.count - a.view.count || a.view.name.localeCompare(b.view.name)
        )
        .map((x) => x.view);
    } catch {
      return [];
    }
  }
);

/**
 * Products to feature on the brand's hero page. Curated via
 * `Brand.featuredProductIds` when set; otherwise falls back to that brand's
 * own top products (same featured/popularity sort the rest of the catalogue
 * uses), so the section is never empty while nothing's been curated yet.
 *
 * Takes the brand's id directly rather than looking it up again by slug —
 * every caller already has a `BrandView` in hand (from `getBrandBySlug`) by
 * the time it needs featured products, and this page already fires a dozen-
 * plus small queries in parallel, so skipping an avoidable one matters.
 */
export const getBrandFeaturedProducts = cache(
  async (brand: { id: string; featuredProductIds: BrandView["featuredProductIds"] }, limit = 8) => {
    try {
      const curatedIds = Array.isArray(brand.featuredProductIds)
        ? (brand.featuredProductIds as unknown[]).filter((v): v is string => typeof v === "string")
        : [];

      if (curatedIds.length > 0) {
        const rows = await prisma.product.findMany({
          where: { id: { in: curatedIds }, ...PUBLIC_PRODUCT_WHERE },
          include: PRODUCT_INCLUDE,
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        const ordered = curatedIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
        if (ordered.length > 0) return ordered.slice(0, limit).map(toCatalogProduct);
      }

      const fallback = await prisma.product.findMany({
        where: { brandId: brand.id, ...PUBLIC_PRODUCT_WHERE },
        include: PRODUCT_INCLUDE,
        orderBy: [{ featured: "desc" }, { viewCount: "desc" }, { createdAt: "desc" }],
        take: limit,
      });
      return fallback.map(toCatalogProduct);
    } catch {
      return [];
    }
  }
);

/** Admin-curated "Featured Collections" for this brand (e.g. Jaquar → "Signature Bath"). */
export const getBrandFeaturedCollections = cache(
  async (brandSlug: string) => {
    try {
      const rows = await prisma.collection.findMany({
        where: { brand: { slug: brandSlug }, published: true, deletedAt: null },
        orderBy: { sortOrder: "asc" },
        select: {
          slug: true,
          name: true,
          description: true,
          image: true,
          _count: { select: { products: { where: PUBLIC_PRODUCT_WHERE } } },
        },
      });
      return rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        description: r.description,
        image: resolveImageRef(r.image),
        count: r._count.products,
      }));
    } catch {
      return [];
    }
  }
);

/**
 * The live "Bathware" category tree (children of the `bathware` parent, with
 * published-product counts) — the single source of truth for `/bathware`
 * navigation and route generation. No hardcoded category list anywhere.
 */
export interface SectionCategory {
  slug: string;
  name: string;
  /** Published products in this category *and everything under it*. */
  count: number;
  /** Null for a direct child of the section. */
  parentSlug: string | null;
  parentName: string | null;
}

/**
 * Published child categories of one top-level section, with real counts,
 * strongest first. Sections with nothing in them are dropped.
 *
 * `count` spans each category's whole subtree. Counting only products filed
 * directly on the child advertised "Faucets 123" for a category holding 445 —
 * and the page beneath it listed the same 123, because the search was scoped
 * the same way. See `getCategorySubtreeIds`.
 */
export const getSectionCategories = cache(
  async (sectionSlug: string): Promise<SectionCategory[]> => {
    try {
      const parent = await prisma.category.findUnique({ where: { slug: sectionSlug }, select: { id: true } });
      if (!parent) return [];

      const children = await prisma.category.findMany({
        where: { parentId: parent.id, published: true, deletedAt: null },
        select: { id: true, slug: true, name: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
      });
      if (children.length === 0) return [];

      const countById = await getSubtreeProductCounts(children.map((c) => c.id));

      return children
        .map((c) => ({
          slug: c.slug,
          name: c.name,
          count: countById.get(c.id) ?? 0,
          parentSlug: null,
          parentName: null,
        }))
        .filter((c) => c.count > 0)
        .sort((a, b) => b.count - a.count);
    } catch {
      return [];
    }
  }
);

/**
 * Resolve one category *anywhere inside* a section, for `/tiles/[category]`
 * and `/bathware/[category]`.
 *
 * Accepting descendants, not just direct children, is what gives the 51
 * third-level categories — Spa Systems, Shower Panels, Large Format — a page
 * of their own. Before this they existed in the data, held three quarters of
 * the catalogue between them, and had no URL at all.
 *
 * Returns null when the slug is not inside this section, so `/tiles/faucets`
 * still 404s rather than rendering a bathware category under the tiles
 * section.
 */
export const getSectionCategory = cache(
  async (sectionSlug: string, categorySlug: string): Promise<SectionCategory | null> => {
    if (categorySlug === sectionSlug) return null;

    // Deliberately uncaught. `null` from here means "no such category" and the
    // page turns it into a 404, so a database error must not be allowed to
    // masquerade as one — see the note in `category-tree.ts`.
    {
      const ids = await getCategorySubtreeIds(sectionSlug);
      if (ids.length === 0) return null;

      const cat = await prisma.category.findFirst({
        where: { slug: categorySlug, id: { in: ids }, published: true, deletedAt: null },
        select: {
          id: true,
          slug: true,
          name: true,
          parent: { select: { slug: true, name: true } },
        },
      });
      if (!cat) return null;

      const count = (await getSubtreeProductCounts([cat.id])).get(cat.id) ?? 0;
      if (count === 0) return null;

      return {
        slug: cat.slug,
        name: cat.name,
        count,
        // The section root is not a useful crumb — the page already sits under
        // it — so an intermediate parent is reported and the root is not.
        parentSlug: cat.parent && cat.parent.slug !== sectionSlug ? cat.parent.slug : null,
        parentName: cat.parent && cat.parent.slug !== sectionSlug ? cat.parent.name : null,
      };
    }
  }
);

/** Every category inside a section, for route generation and sitemaps. */
export const getSectionCategoryTree = cache(
  async (sectionSlug: string): Promise<SectionCategory[]> => {
    // Uncaught for the same reason as `getSectionCategory`: this drives
    // `generateStaticParams`, and an empty list silently un-builds every
    // category page in the section.
    {
      const ids = await getCategorySubtreeIds(sectionSlug);
      if (ids.length === 0) return [];

      const cats = await prisma.category.findMany({
        where: { id: { in: ids }, published: true, deletedAt: null, NOT: { slug: sectionSlug } },
        select: { id: true, slug: true, name: true, parent: { select: { slug: true, name: true } } },
      });
      const countById = await getSubtreeProductCounts(cats.map((c) => c.id));

      return cats
        .map((c) => ({
          slug: c.slug,
          name: c.name,
          count: countById.get(c.id) ?? 0,
          parentSlug: c.parent && c.parent.slug !== sectionSlug ? c.parent.slug : null,
          parentName: c.parent && c.parent.slug !== sectionSlug ? c.parent.name : null,
        }))
        .filter((c) => c.count > 0)
        .sort((a, b) => b.count - a.count);
    }
  }
);

/** The bathware section's categories. Kept as the name callers already use. */
export const getBathwareCategories = cache(() => getSectionCategories("bathware"));

/** The tiles section's categories. */
export const getTileCategories = cache(() => getSectionCategories("tiles"));

export interface BrandNavItem {
  slug: string;
  name: string;
}

export interface BrandNavGroups {
  bathwareBrands: BrandNavItem[];
  tileBrands: BrandNavItem[];
  otherBrands: BrandNavItem[];
}

/**
 * Every brand with published products, bucketed by which top-level category
 * dominates its catalogue — powers the grouped "Brands" mega-menu section.
 * Data-driven rather than a hardcoded Bathware/Tile split, so a brand added
 * through the CMS lands in the right column automatically.
 */
export const getBrandNavGroups = cache(async (): Promise<BrandNavGroups> => {
  try {
    const [brands, tilesCat, bathwareCat] = await Promise.all([
      getBrands(),
      prisma.category.findUnique({ where: { slug: "tiles" }, select: { id: true } }),
      prisma.category.findUnique({ where: { slug: "bathware" }, select: { id: true } }),
    ]);

    const withProducts = brands.filter((b) => b.productCount > 0);
    if (withProducts.length === 0) return { bathwareBrands: [], tileBrands: [], otherBrands: [] };

    const [tileCounts, bathwareCounts] = await Promise.all([
      tilesCat
        ? prisma.product.groupBy({
            by: ["brandId"],
            where: { ...PUBLIC_PRODUCT_WHERE, categoryId: tilesCat.id },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      bathwareCat
        ? prisma.product.groupBy({
            by: ["brandId"],
            where: { ...PUBLIC_PRODUCT_WHERE, category: { parentId: bathwareCat.id } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    // Brand rows carry `slug`, not `id` — resolve ids once to match counts back up.
    const brandIdRows = await prisma.brand.findMany({
      where: { slug: { in: withProducts.map((b) => b.slug) } },
      select: { id: true, slug: true },
    });
    const slugById = new Map(brandIdRows.map((b) => [b.id, b.slug]));
    const countBySlug = (rows: { brandId: string | null; _count: { _all: number } }[]) => {
      const map = new Map<string, number>();
      for (const r of rows) {
        const slug = slugById.get(r.brandId ?? "");
        if (slug) map.set(slug, r._count._all);
      }
      return map;
    };
    const tileCountBySlug = countBySlug(tileCounts);
    const bathwareCountBySlug = countBySlug(bathwareCounts);

    const groups: BrandNavGroups = { bathwareBrands: [], tileBrands: [], otherBrands: [] };
    for (const b of withProducts) {
      const tiles = tileCountBySlug.get(b.slug) ?? 0;
      const bathware = bathwareCountBySlug.get(b.slug) ?? 0;
      const item = { slug: b.slug, name: b.name };
      if (bathware === 0 && tiles === 0) groups.otherBrands.push(item);
      else if (bathware >= tiles) groups.bathwareBrands.push(item);
      else groups.tileBrands.push(item);
    }

    return groups;
  } catch {
    return { bathwareBrands: [], tileBrands: [], otherBrands: [] };
  }
});

function fallbackBrands(): BrandView[] {
  return fallbackBrandNames.map((name) => ({
    id: slugify(name),
    slug: slugify(name),
    name,
    logo: null,
    banner: null,
    mobileCoverImage: null,
    heroVideo: null,
    heroPoster: null,
    description: null,
    shortDescription: null,
    website: null,
    catalogPdf: null,
    featured: false,
    featuredProductIds: null,
    productCount: 0,
    categoryCount: 0,
  }));
}
