import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  Download,
  Ruler,
  Layers,
  Palette,
  Fingerprint,
  Box,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Compass,
  MapPin,
} from "lucide-react";
import {
  getCatalogProduct,
  getRelatedProducts,
  getCatalogParams,
  getProductVariants,
  getProductCategoryTrail,
} from "@/lib/products";
import { Container } from "@/components/ui/Container";
import { ApplicationBadge } from "@/components/site/catalog/ApplicationBadge";
import { RelatedProducts } from "@/components/site/catalog/RelatedProducts";
import { RecentlyViewed } from "@/components/site/catalog/RecentlyViewed";
import { StickyProductCta } from "@/components/site/catalog/StickyProductCta";
import { ProductGallery } from "@/components/site/catalog/ProductGallery";
import { ProductInfoActions } from "@/components/site/catalog/ProductInfoActions";
import { TechnicalAccordion } from "@/components/site/catalog/TechnicalAccordion";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { applySeo, getSeoForPath, productJsonLd, productGroupJsonLd } from "@/lib/seo";
import { buildProductMetadata } from "@/lib/seo-metadata";
import { getWhatsAppOrderingNumber } from "@/lib/whatsapp";
import { SafeImage } from "@/components/ui/SafeImage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return getCatalogParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; category: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCatalogProduct(slug);
  if (!product) return {};

  // One product, one canonical URL. `product.category` is the section the
  // product resolves to, which is what every link on the site, the sitemap and
  // `generateStaticParams` all emit — so a request arriving under any other
  // category segment still canonicalises here (and is redirected here by the
  // page below).
  const path = `/products/${product.category}/${product.slug}`;

  // Built from this product's own attributes rather than one template, so
  // 6,000 products do not share a description. "Prestige Tiles" is not used as
  // the site name here — the catalogue is not tile-only.
  const base = buildProductMetadata({
    name: product.name,
    slug: product.slug,
    categorySlug: product.category,
    categoryName: (await getProductCategoryTrail(product.slug))[0]?.name ?? null,
    brand: product.brand,
    description: product.description,
    sku: product.sku,
    finish: product.finish,
    material: product.texture,
    color: product.color,
    size: product.sizes[0],
    image: product.lifestyleImage,
  });

  return applySeo(base, await getSeoForPath(path), path);
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; category: string }>;
}) {
  const { slug, category } = await params;
  const product = await getCatalogProduct(slug);
  if (!product) notFound();

  // The page is keyed on the slug alone, so before this every category segment
  // served the same product at HTTP 200 — /products/tiles/x and
  // /products/wellness/x were two indexable URLs for one product, both
  // pointing their canonical at a third. A permanent redirect collapses them
  // onto the one canonical URL instead of relying on the canonical tag to
  // undo a duplicate we served ourselves.
  if (category !== product.category) {
    permanentRedirect(`/products/${product.category}/${product.slug}`);
  }

  const whatsappNumber = await getWhatsAppOrderingNumber();
  const orderVariants = await getProductVariants(slug);
  const related = await getRelatedProducts(product, 4);

  // Category crumbs link into the section tree that owns them —
  // /bathware/wellness, /tiles/gvt — so the section comes from the trail's own
  // root rather than from `product.category`: a Designer Pick is curated
  // across sections but still lives in one real category. A product filed
  // outside both trees gets no category crumbs rather than a dead link.
  const fullTrail = await getProductCategoryTrail(slug);
  const rootSlug = fullTrail[fullTrail.length - 1]?.slug;
  const sectionHref =
    rootSlug === "tiles" ? "/tiles" : rootSlug === "bathware" ? "/bathware" : null;
  const trail = sectionHref
    ? fullTrail.filter((c) => c.slug !== rootSlug).reverse()
    : [];

  // The real section, not `product.category` — that field's a URL bucket
  // ("sanitary") in a different namespace from the tree's own root slug
  // ("bathware"), and previously defaulted anything it didn't recognise to
  // "Tiles". A product with no real category (see the category audit
  // report) now reads as "Products" rather than a false "Tiles" label.
  const categoryLabel = product.category === "designer-picks"
    ? "Designer Picks"
    : rootSlug === "bathware"
      ? "Sanitaryware"
      : rootSlug === "tiles"
        ? "Tiles"
        : "Products";

  // `/products/tiles` and `/products/sanitary` both 308 to the section pages,
  // so linking them here would send every visitor — and every crawler — through
  // a redirect on the way out of a product. Designer Picks has no section tree
  // and keeps its own listing.
  const sectionLink =
    product.category === "designer-picks"
      ? "/products/designer-picks"
      : (sectionHref ?? `/products/${product.category}`);

  const productNo = product.sku || `PT-${slug.slice(0, 6).toUpperCase()}`;

  // The tile-story copy below is true of vitrified tiles specifically — under a
  // faucet or a towel rail it is a wrong factual claim, not just off-brand
  // copy. The section root decides it, so a Designer Pick that happens to be a
  // shower is not described as a fired slab.
  const isTile = rootSlug ? rootSlug === "tiles" : product.category !== "sanitary";

  // Packaging figures, and only the ones this product actually carries. These
  // were four hardcoded constants — "2 Pcs", "15.5 Sq.Ft", "31.5 Kg", "< 0.05%
  // water absorption" — rendered identically on every tile page regardless of
  // format or supplier. A 600x600 and a 1200x2400 slab do not share a box
  // weight, so the panel now comes from the record or does not render.
  const packingDetails = [
    product.packing ? { label: "Packing", value: product.packing } : null,
    product.coverage ? { label: "Coverage per Box", value: product.coverage } : null,
    product.weight ? { label: "Box Weight", value: product.weight } : null,
  ].filter((d): d is { label: string; value: string } => d !== null);

  // A product with variants is one ProductGroup, not N competing pages: the
  // variants all resolve to this single canonical URL. Without variants the
  // plain Product markup is correct.
  const variants = await getProductVariants(slug);
  const images = [product.lifestyleImage, product.textureImage, ...product.gallery];

  const jsonLd =
    productGroupJsonLd({
      name: product.name,
      slug: product.slug,
      category: product.category,
      description: product.description,
      brand: product.brand,
      images,
      productCode: product.sku,
      variants,
    }) ??
    productJsonLd({
      name: product.name,
      slug: product.slug,
      category: product.category,
      description: product.description,
      brand: product.brand,
      images,
      color: product.color,
      material: product.texture,
      productCode: product.sku,
      sizes: product.sizes,
    });

  return (
    <div className="bg-canvas text-text pt-24 pb-20 md:pt-28 md:pb-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb & Navigation Section */}
      <section className="mb-8 md:mb-12">
        <Container size="wide">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line/40 pb-4">
            <Breadcrumbs
              items={[
                { label: "Products", href: "/products" },
                { label: categoryLabel, href: sectionLink },
                // The real categories between the section and the product, so
                // a spa system reads Products › Sanitaryware › Wellness › Spa
                // Systems instead of stopping at the section.
                ...trail.map((c) => ({
                  label: c.name,
                  href: `${sectionHref}/${c.slug}`,
                })),
                { label: product.name },
              ]}
            />

            <Link
              href={sectionLink}
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted transition-colors hover:text-gold"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to {categoryLabel}</span>
            </Link>
          </div>
        </Container>
      </section>

      {/* Product Hero Section (Desktop: Left ~58% Gallery, Right ~42% Info) */}
      <section className="mb-20 md:mb-28">
        <Container size="wide">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16 xl:gap-20 items-start">
            {/* LEFT: Architectural Gallery */}
            <div className="w-full">
              <ProductGallery
                mainImage={product.lifestyleImage}
                textureImage={product.textureImage}
                galleryImages={product.gallery}
                productName={product.name}
                brand={product.brand}
                tag={product.tag}
              />
            </div>

            {/* RIGHT: Product Information */}
            <div className="flex flex-col space-y-6">
              {/* Eyebrow & Brand */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
                  <span>{product.brand}</span>
                  <span className="text-line-strong">•</span>
                  <span className="text-muted">{product.collection}</span>
                </div>
                {/* Subtle Product Code */}
                <span className="font-mono text-[11px] font-medium text-faint bg-secondary px-2.5 py-1 rounded-md border border-line/40">
                  Product No. {productNo}
                </span>
              </div>

              {/* Editorial Main Heading */}
              <div>
                <h1 className="font-serif text-[clamp(2.25rem,4.5vw,3.75rem)] font-light leading-[1.1] text-text tracking-tight">
                  {product.name}
                </h1>
                <p className="mt-3 text-sm md:text-base leading-relaxed text-muted font-normal max-w-xl">
                  {product.description}
                </p>
              </div>

              {/* Spec Badges Ribbon */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-3 border-y border-line/40">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-faint">
                    Surface Finish
                  </span>
                  <span className="text-xs font-semibold text-text mt-0.5 truncate">
                    {product.finish}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-faint">
                    Thickness
                  </span>
                  <span className="text-xs font-semibold text-text mt-0.5">
                    {product.thickness}
                  </span>
                </div>

                <div className="flex flex-col col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-faint">
                    Tone & Color
                  </span>
                  <span className="text-xs font-semibold text-text mt-0.5 truncate">
                    {product.color}
                  </span>
                </div>
              </div>

              {/* Interactive Actions (WhatsApp CTA, Quantity, Size, Share) */}
              <ProductInfoActions product={product} whatsappNumber={whatsappNumber} variants={orderVariants} />

              {/* Trust Badges */}
              <div className="grid grid-cols-2 gap-4 pt-2 text-[11px] text-muted">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-gold shrink-0" />
                  <span>100% Quality Assured</span>
                </div>
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-gold shrink-0" />
                  <span>Custom Cutting Available</span>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Architectural Specification Grid */}
      <section className="mb-24 md:mb-32">
        <Container size="wide">
          <div className="rounded-[32px] bg-secondary/80 p-8 sm:p-12 lg:p-16 border border-line/60 shadow-lift">
            <div className="max-w-2xl mb-10">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold block mb-2">
                MATERIAL DIMENSIONS & ATTRIBUTES
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-light text-text">
                Architectural Specifications
              </h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 border-b border-line/50 pb-10">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted mb-2">
                  <Ruler className="h-4 w-4 text-gold" />
                  <span>FORMAT SIZES</span>
                </div>
                <div className="font-serif text-xl sm:text-2xl font-medium text-text">
                  {product.sizes[0] || "Standard"}
                </div>
                {product.sizes.length > 1 && (
                  <p className="mt-1 text-[11px] text-muted">
                    +{product.sizes.length - 1} additional formats
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted mb-2">
                  <Layers className="h-4 w-4 text-gold" />
                  <span>SURFACE FINISH</span>
                </div>
                <div className="font-serif text-xl sm:text-2xl font-medium text-text">
                  {product.finish}
                </div>
                {isTile && <p className="mt-1 text-[11px] text-muted">High durability vitrified</p>}
              </div>

              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted mb-2">
                  <Palette className="h-4 w-4 text-gold" />
                  <span>COLOR TONE</span>
                </div>
                <div className="font-serif text-xl sm:text-2xl font-medium text-text">
                  {product.color}
                </div>
                {isTile && <p className="mt-1 text-[11px] text-muted">Natural mineral hue</p>}
              </div>

              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted mb-2">
                  <Fingerprint className="h-4 w-4 text-gold" />
                  <span>TEXTURE GRAIN</span>
                </div>
                <div className="font-serif text-xl sm:text-2xl font-medium text-text truncate">
                  {product.texture}
                </div>
                <p className="mt-1 text-[11px] text-muted">Tactile depth</p>
              </div>
            </div>

            {/* Packaging & Logistics Details — rendered only for the figures
                this product actually carries; see `packingDetails`. */}
            <div className="mt-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
              {packingDetails.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text mb-3">
                    <Box className="h-4 w-4 text-gold" />
                    <span>Packaging & Logistics Standards</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    {packingDetails.map((item) => (
                      <div key={item.label} className="bg-surface p-3.5 rounded-xl border border-line/40">
                        <span className="text-[10px] text-muted block uppercase tracking-wider font-semibold">
                          {item.label}
                        </span>
                        <span className="font-bold text-text mt-1 block">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Link
                href="/catalogue"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-text px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-gold hover:text-black transition-colors shrink-0 shadow-sm"
              >
                <Download className="h-4 w-4" />
                <span>PDF Tech Sheet</span>
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Material Story (Editorial Section - Asymmetric 60/40 Split) — this
          copy ("slab", "vitrified durability", "floor and wall transitions")
          is specific to tiles and reads as wrong/nonsensical under a faucet
          or bath fitting, so it's skipped rather than shown incorrectly. */}
      {isTile && (
      <section className="mb-24 md:mb-32">
        <Container size="wide">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 items-center">
            {/* Image Side */}
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[36px_16px_80px_20px] bg-stone-200 border border-line/40 shadow-lift">
              <SafeImage
                src={product.textureImage || product.lifestyleImage}
                alt={`${product.name} material story detail`}
                fill
                sizes="(max-width: 1024px) 100vw, 55vw"
                placeholderLabel={product.brand}
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 text-white">
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gold mb-1">
                  <Sparkles className="h-3 w-3" /> TACTILE DEPTH & ARTISANRY
                </span>
                <p className="font-serif text-lg md:text-xl font-light">
                  Precision engineered to capture authentic geological movement.
                </p>
              </div>
            </div>

            {/* Narrative Content */}
            <div className="flex flex-col space-y-6">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
                THE MATERIAL STORY
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-light text-text leading-[1.15]">
                Crafted for Contemporary Architectural Spaces
              </h2>
              <div className="space-y-4 text-sm sm:text-base leading-relaxed text-muted font-normal">
                <p>
                  {product.name} embodies modern surface design, fusing high-grade vitrified durability with the subtle nuance of natural stone. Every slab undergoes strict temperature-firing processes to ensure impervious non-porosity and flawless structural integrity.
                </p>
                <p>
                  Designed for seamlessly continuous floor and wall transitions, this surface provides superior resistance against staining, thermal variance, and daily heavy footfall, making it an ideal specification for high-end residences, luxury hospitality, and premium retail environments.
                </p>
              </div>

              <div className="pt-4 border-t border-line/40 flex flex-wrap gap-6">
                <div>
                  <span className="font-serif text-2xl font-medium text-text block">
                    Zero Maintenance
                  </span>
                  <span className="text-xs text-muted">Stain & scratch resistant</span>
                </div>
                <div>
                  <span className="font-serif text-2xl font-medium text-text block">
                    Eco Certified
                  </span>
                  <span className="text-xs text-muted">Sustainably manufactured</span>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>
      )}

      {/* Application Environments Showcase */}
      {product.applications && product.applications.length > 0 && (
        <section className="mb-24 md:mb-32">
          <Container size="wide">
            <div className="mb-10 text-center max-w-2xl mx-auto">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold block mb-2">
                APPLICATION SUITABILITY
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-light text-text">
                Ideal Environments
              </h2>
              <p className="mt-3 text-sm text-muted">
                Extensively tested for longevity across residential and commercial settings.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              {product.applications.map((app) => (
                <ApplicationBadge key={app} application={app} />
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Large Full-Width Architectural Curved Media Section */}
      <section className="mb-24 md:mb-32">
        <Container size="wide">
          <div className="relative aspect-[21/9] min-h-[320px] w-full overflow-hidden rounded-[32px] md:rounded-[48px] bg-stone-900 border border-line/40 shadow-lift">
            <SafeImage
              src={product.lifestyleImage}
              alt={`${product.name} full scale interior environment`}
              fill
              sizes="100vw"
              placeholderLabel={product.brand}
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/40 backdrop-brightness-95" />
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <div className="max-w-2xl text-white space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
                  PRESTIGE ARCHITECTURAL COLLECTION
                </span>
                <h3 className="font-serif text-2xl sm:text-4xl md:text-5xl font-light leading-tight">
                  {product.name}
                </h3>
                <p className="text-xs sm:text-sm text-stone-300 font-normal max-w-lg mx-auto">
                  Transforming residential and commercial interiors into timeless architectural statements.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Technical Accordion Section */}
      <section className="mb-24 md:mb-32">
        <Container size="wide">
          <TechnicalAccordion product={product} />
        </Container>
      </section>

      {/* Showroom & WhatsApp Consultation Banner */}
      <section className="mb-24 md:mb-32">
        <Container size="wide">
          <div className="rounded-[32px] bg-canvas-inverse text-white p-8 sm:p-12 lg:p-16 border border-white/10 shadow-lift relative overflow-hidden">
            <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-3 max-w-2xl">
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-gold">
                  PERSONAL CONSULTATION
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-light leading-snug text-white">
                  Experience {product.name} in person at our Showroom
                </h3>
                <p className="text-xs sm:text-sm text-stone-300">
                  Speak with our material specialists for precise quantity estimations, custom cut sizing, and live depot stock confirmations.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 shrink-0">
                <a
                  href={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(
                    `Hello Prestige Tiles,\n\nI would like to schedule a consultation/enquiry for *${product.name}* (${product.brand}).`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-text hover:bg-gold-bright transition-colors"
                >
                  <span>Enquire via WhatsApp</span>
                </a>
                <Link
                  href="/showrooms"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/20 transition-colors backdrop-blur-sm"
                >
                  <MapPin className="h-4 w-4 text-gold" />
                  <span>Find a Showroom</span>
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Related Products Section */}
      {related.length > 0 && (
        <section className="mb-20 md:mb-28 border-t border-line/40 pt-20">
          <Container size="wide">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-12">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold block mb-2">
                  CURATED SELECTION
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-light text-text">
                  Explore Similar Surfaces
                </h2>
              </div>
              <Link
                href={sectionLink}
                className="text-xs font-bold uppercase tracking-wider text-text hover:text-gold transition-colors"
              >
                View All {categoryLabel} →
              </Link>
            </div>

            <RelatedProducts products={related} />
          </Container>
        </section>
      )}

      {/* Recently Viewed Bar */}
      <RecentlyViewed currentSlug={product.slug} currentName={product.name} />

      {/* Sticky Mobile CTA Bar */}
      <StickyProductCta
        name={product.name}
        brand={product.brand}
        sku={product.sku}
        size={product.sizes[0]}
        whatsappNumber={whatsappNumber}
        hasVariants={orderVariants.length > 0}
      />
    </div>
  );
}
