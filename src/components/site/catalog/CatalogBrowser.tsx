"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, SlidersHorizontal, Loader2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ProductCard } from "./ProductCard";
import { FilterChip } from "./FilterChip";
import type { CatalogSearchResult } from "@/lib/catalog-search";

/**
 * Catalogue browser for a database-scale range.
 *
 * A sibling to `CatalogExplorer` rather than a replacement: that component
 * filters in the browser from the array it's handed, which is right for a
 * curated set and impossible once an import pushes the catalogue into the
 * thousands. Here filtering, counting and pagination all happen in Postgres,
 * and state lives in the URL — so a filtered view is shareable, linkable and
 * indexable, which the client-side version never was.
 *
 * The cards, quick view and chips are the existing components, unchanged.
 */
import { CatalogueHero } from "./CatalogueHero";

export function CatalogBrowser({
  result,
  lockedCategory,
  lockedBrand,
  lockedCollection,
  eyebrow,
  title,
  description,
  showHero = true,
  brandStrip,
  searchPlaceholder,
  showCategoryOnCards = false,
  heroImage,
  heroVideo,
  heroPoster,
  noHeroMedia,
}: {
  result: CatalogSearchResult;
  lockedCategory?: string;
  /**
   * Set on brand-scoped pages (e.g. `/brands/jaquar/faucets`) where the brand
   * is fixed by the URL and re-applied server-side regardless of query
   * params — hides the Brand facet group so it can't look clickable without
   * actually doing anything.
   */
  lockedBrand?: string;
  /**
   * Set on `/collections/[slug]`, where the collection is fixed by the URL and
   * re-applied server-side — the facet group is hidden for the same reason
   * `lockedBrand` hides Brand: a chip that cannot change anything should not
   * look clickable.
   */
  lockedCollection?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  /**
   * Set `false` on a page that already renders its own `<h1>` above this
   * component — `/bathware` (`PageHero`) and `/brands/[slug]` (`BrandHero`).
   * Without it, a caller that passed no `title` here got `CatalogueHero`'s
   * placeholder copy ("An archive worth exploring.") as a second, visible,
   * generic heading directly under its real one — two `<h1>`s on the page,
   * the second reading as filler rather than content.
   */
  showHero?: boolean;
  /** Rendered between the hero and the search/filter toolbar — e.g. `/products`'s brand-first strip. Unset everywhere else. */
  brandStrip?: ReactNode;
  searchPlaceholder?: string;
  /** Cards show a small category label when the category varies card-to-card (cross-category listings like `/products`, `/bathware`). */
  showCategoryOnCards?: boolean;
  /** Overrides the hero's stock photo — e.g. a category's own CMS image on a brand+category page. */
  heroImage?: string;
  heroVideo?: string;
  heroPoster?: string;
  /** Text-only hero when no image/video exists (instead of the stock default). */
  noHeroMedia?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const { products, total, page, pageCount, facets } = result;

  function apply(mutate: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page"); // any filter change returns to page 1
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const toggle = (key: string, value: string) =>
    apply((p) => (p.get(key) === value ? p.delete(key) : p.set(key, value)));

  const goToPage = (n: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (n <= 1) params.delete("page");
    else params.set("page", String(n));
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  };

  const activeFilters = ["brand", "collection", "finish", "material", "colour", "size", "surface", "room", "q"]
    .map((k) => ({ key: k, value: searchParams.get(k) }))
    .filter((f): f is { key: string; value: string } => !!f.value);

  const groups: { key: string; label: string; options: { value: string; count: number }[] }[] = [
    { key: "room", label: "Room", options: facets.applications },
    { key: "brand", label: "Brand", options: lockedBrand ? [] : facets.brands },
    { key: "collection", label: "Collection", options: lockedCollection ? [] : facets.collections },
    { key: "finish", label: "Finish", options: facets.finishes },
    { key: "material", label: "Material", options: facets.materials },
    { key: "colour", label: "Colour", options: facets.colors },
    { key: "size", label: "Size", options: facets.sizes },
    { key: "surface", label: "Surface", options: facets.surfaces },
  ].filter((g) => g.options.length > 1);

  return (
    <div className="min-h-screen bg-white pb-24">
      {showHero && (
        <CatalogueHero
          eyebrow={eyebrow}
          title={title}
          description={description}
          heroImage={heroImage}
          heroVideo={heroVideo}
          heroPoster={heroPoster}
          hideMedia={noHeroMedia}
        />
      )}

      <Container size="wide">
        {brandStrip && <div className="relative z-20 mb-6">{brandStrip}</div>}

        {/* Search + filter toggle in floating container */}
        <div className="relative z-20 -mt-2 mb-10 rounded-3xl border border-stone-200/80 bg-white p-4 sm:p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
          <div className="flex flex-wrap items-center gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                apply((p) => (query.trim() ? p.set("q", query.trim()) : p.delete("q")));
              }}
              className="relative min-w-[220px] flex-1"
            >
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder ?? "Search tiles, collections, finishes…"}
                className="w-full rounded-full border border-stone-200 bg-stone-50/70 py-2.5 pl-11 pr-4 text-xs font-medium outline-none transition-all focus:border-gold focus:bg-white"
              />
            </form>

            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-xs font-bold transition-all duration-300 hover:border-gold hover:text-gold"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-gold" />
              Filters
              {activeFilters.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-ink">
                  {activeFilters.length}
                </span>
              )}
            </button>

            <select
              value={searchParams.get("sort") ?? "featured"}
              onChange={(e) => apply((p) => (e.target.value === "featured" ? p.delete("sort") : p.set("sort", e.target.value)))}
              className="rounded-full border border-stone-200 bg-white px-4 py-2.5 text-xs font-semibold text-stone-700 outline-none transition-colors hover:border-stone-300 focus:border-gold cursor-pointer"
            >
              <option value="featured">Most Popular</option>
              <option value="newest">Newest</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>

          {/* Active filter pills */}
          {activeFilters.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-stone-100">
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => apply((p) => p.delete(f.key))}
                  className="inline-flex items-center gap-1.5 rounded-full bg-black px-3 py-1 text-xs text-white transition-opacity hover:opacity-80"
                >
                  {f.value}
                  <X className="h-3 w-3" />
                </button>
              ))}
              <button
                onClick={() => startTransition(() => router.push(pathname))}
                className="text-xs text-stone-500 underline underline-offset-4 hover:text-ink"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Facet rail */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="mb-10 overflow-hidden"
            >
              <div className="space-y-6 rounded-3xl border border-ink/8 bg-white/60 p-6">
                {groups.map((group) => (
                  <div key={group.key}>
                    <p className="text-eyebrow mb-3 text-ink/40">{group.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.options.slice(0, 18).map((opt) => (
                        <FilterChip
                          key={opt.value}
                          label={`${opt.value} (${opt.count})`}
                          active={searchParams.get(group.key) === opt.value}
                          onClick={() => toggle(group.key, opt.value)}
                          group={group.key}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result count */}
        <div className="mb-8 flex items-center gap-3">
          <p className="text-sm text-ink/45">
            {total === 0 ? "No pieces match" : `${total} piece${total === 1 ? "" : "s"}`}
            {lockedCategory ? "" : " across the catalogue"}
          </p>
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />}
        </div>

        {/* Grid */}
        {products.length === 0 ? (
          <div className="py-24 text-center">
            {activeFilters.length === 0 ? (
              // Nothing is filtered, so there is genuinely nothing here yet —
              // saying "no products for these filters" would be wrong.
              <>
                <p className="text-lg text-ink/60">Products in this category are being added.</p>
                <p className="mt-2 text-sm text-ink/40">
                  Visit a showroom or message us on WhatsApp to see what is available today.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg text-ink/50">No products found for these filters.</p>
                <button
                  onClick={() => startTransition(() => router.push(pathname))}
                  className="mt-4 text-sm text-gold underline underline-offset-4"
                >
                  Clear Filters
                </button>
              </>
            )}

            {facets.brands.length > 0 && (
              <div className="mt-10">
                <p className="text-eyebrow mb-3 text-ink/40">Try another brand</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {facets.brands.slice(0, 6).map((b) => (
                    <button
                      key={b.value}
                      onClick={() => apply((p) => p.set("brand", b.value))}
                      className="rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-muted transition-colors hover:border-gold/50 hover:text-text"
                    >
                      {b.value}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5 ${isPending ? "opacity-60" : ""} transition-opacity`}>
            {products.map((product) => (
              <ProductCard key={product.slug} product={product} showCategory={showCategoryOnCards} />
            ))}
          </div>
        )}

        {/* Pagination — real links so crawlers can reach the whole catalogue */}
        {pageCount > 1 && (
          <nav className="mt-16 flex items-center justify-center gap-2" aria-label="Catalogue pages">
            <PageLink disabled={page <= 1} onClick={() => goToPage(page - 1)} label="Previous" />
            {pageWindow(page, pageCount).map((n, i) =>
              n === null ? (
                <span key={`gap-${i}`} className="px-2 text-ink/30">…</span>
              ) : (
                <button
                  key={n}
                  onClick={() => goToPage(n)}
                  aria-current={n === page ? "page" : undefined}
                  className={`h-10 min-w-10 rounded-full px-3 text-sm transition-colors ${
                    n === page ? "bg-ink text-ivory" : "border border-ink/10 hover:border-gold/50"
                  }`}
                >
                  {n}
                </button>
              )
            )}
            <PageLink disabled={page >= pageCount} onClick={() => goToPage(page + 1)} label="Next" />
          </nav>
        )}
      </Container>
    </div>
  );
}

function PageLink({ disabled, onClick, label }: { disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-ink/10 px-4 py-2 text-sm transition-colors hover:border-gold/50 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {label}
    </button>
  );
}

/** 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(current: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages = new Set([1, count, current, current - 1, current + 1]);
  const sorted = [...pages].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push(null);
    out.push(n);
    prev = n;
  }
  return out;
}
