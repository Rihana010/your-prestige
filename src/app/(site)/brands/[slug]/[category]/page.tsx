import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { CatalogBrowser } from "@/components/site/catalog/CatalogBrowser";
import { getBrandBySlug, getBrandCategories } from "@/lib/brands";
import { parseFilters, searchCatalog } from "@/lib/catalog-search";
import { applySeo, getSeoForPath } from "@/lib/seo";
import { buildBrandCategoryMetadata } from "@/lib/seo-metadata";
import { siteUrl } from "@/lib/site-config";

/**
 * A brand's single category — e.g. `/brands/jaquar/faucets` — the narrower
 * sibling of `/brands/[slug]` (that brand, every category) and `/bathware/
 * [category]` (that category, every brand). Same `searchCatalog` engine as
 * both, just with brand and category locked together.
 */

export const revalidate = 600;

export async function generateStaticParams() {
  try {
    const { getBrands } = await import("@/lib/brands");
    const brands = await getBrands();
    const withProducts = brands.filter((b) => b.productCount > 0).slice(0, 40);
    const params: { slug: string; category: string }[] = [];
    for (const b of withProducts) {
      const cats = await getBrandCategories(b.slug);
      for (const c of cats) params.push({ slug: b.slug, category: c.slug });
    }
    return params.slice(0, 300);
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { slug, category } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return {};
  const categories = await getBrandCategories(slug);
  const cat = categories.find((c) => c.slug === category);
  if (!cat) return {};

  const path = `/brands/${slug}/${category}`;
  const base = buildBrandCategoryMetadata({
    brandName: brand.name,
    brandSlug: brand.slug,
    categoryName: cat.name,
    categorySlug: cat.slug,
    count: cat.count,
    image: cat.image,
    // Filtered views of this page canonicalise back to it and drop out of the
    // index; page=N stays indexable so the long tail is still crawlable.
    searchParams: await searchParams,
  });

  return applySeo(base, await getSeoForPath(path), path);
}

export default async function BrandCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, category } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const categories = await getBrandCategories(slug);
  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();

  const sp = await searchParams;
  const result = await searchCatalog({ ...parseFilters(sp), brand: brand.name, category: cat.slug });

  return (
    <main className="min-h-screen bg-white">
      <section className="pb-4 pt-8">
        <Container size="wide">
          <Breadcrumbs
            items={[
              { label: "Brands", href: "/brands" },
              { label: brand.name, href: `/brands/${brand.slug}` },
              { label: cat.name },
            ]}
          />
        </Container>
      </section>

      <CatalogBrowser
        result={result}
        lockedCategory={cat.slug}
        lockedBrand={brand.name}
        eyebrow={brand.name}
        title={`${brand.name} ${cat.name}`}
        description={
          cat.description ??
          (cat.count > 0
            ? `${cat.count} ${cat.name.toLowerCase()} piece${cat.count === 1 ? "" : "s"} from ${brand.name}, displayed at full scale across our Mangaluru showrooms.`
            : `${brand.name} ${cat.name.toLowerCase()} are being added to the catalogue. Visit a showroom or ask us on WhatsApp for what is available today.`)
        }
        heroImage={cat.banner ?? cat.image ?? undefined}
        heroVideo={cat.video ?? undefined}
        heroPoster={cat.videoPoster ?? cat.banner ?? cat.image ?? undefined}
        noHeroMedia={!cat.video && !cat.banner && !cat.image}
      />
    </main>
  );
}
