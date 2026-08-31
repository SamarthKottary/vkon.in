"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SearchIcon, SpinnerIcon } from "@/components/icons/ui";
import { ProductCard } from "@/components/product/ProductCard";
import { categoriesInSector, sectorOf, sectorLabel, sectors, categoryLabel } from "@/content/taxonomy";
import { protectionMeta } from "@/components/icons/protections";
import { fuzzySearchAction } from "@/app/(site)/search-action";
import { fuzzyMatchScore } from "@/lib/fuzzy";
import type { CategoryMeta, Product } from "@/lib/types";

/**
 * Filterable catalogue.
 *
 * Filter state lives in the URL so a filtered view is shareable and the footer's
 * `/products?category=starter` links land pre-filtered. Only categories that
 * actually contain products are offered — an empty filter is a dead end.
 *
 * Four filter axes: **sector**, **category** nested under it, **rating**, and
 * free-text **search**. Note the vocabulary split, because it is a trap: the
 * URL and the code call the first two `sector` and `category`, the labels
 * call them "category" and "sub-category". The client renamed the
 * user-facing words on 2026-08-19; renaming the query parameters too would
 * have broken every link already shared or indexed, so the internal names
 * stayed.
 *
 * **Category is a tree, not two flat lists.** "All categories" is a
 * permanent root row; a sector's own categories — "All sub-categories" plus
 * each one with products — only render while that sector is the active
 * filter. There is no independent "expanded" state: the sector whose
 * children are showing is always exactly the active `sector` filter (client,
 * asked directly: a sector both filters and opens its children in the same
 * click), so switching sectors closes the old list and opens the new one for
 * free, with nothing to get out of sync.
 *
 * **Rating copies the tree's row style** but only shows once a sector is
 * picked (client, 2026-08-27, this file's second pass: "do not show rating
 * when it is in all categories") — the full-catalogue rating list mixed
 * ranges from every sector, most of which do not apply to whichever one a
 * visitor is actually about to narrow into.
 *
 * **There was a fifth axis, a specific-product `<select>`, for one entry in
 * this file's history — removed the same day it shipped** (client: "When i
 * click commercial or any other sub-category, i dont want the product list
 * box seperately on the left side… in mobile view filter no need for
 * seperate product box at the bottom"). `product/ProductRow`'s grid already
 * shows every matching card once category/rating/search have narrowed the
 * list; a `<select>` naming the same products by name a second time turned
 * out to be a control nobody asked to keep once they saw it next to the
 * thing it duplicated.
 *
 * **Search filters live, against local state, not the URL, on every
 * keystroke** — `searchDraft`, separate from the `q` search param. Routing
 * on every keystroke would spam `router.replace` and is unnecessary: the
 * `products` array is already loaded client-side, so filtering it needs no
 * round trip. `q` itself commits on blur or Enter, so a search is still a
 * shareable, back-button-able URL state — just not on every keystroke. The
 * field is `type="text"`, not `type="search"` (client, same second pass: "In
 * search bar instead of X, lets have clear button") — a native `search`
 * input grows its own `×` in WebKit/Blink the moment it has focus and text,
 * which is exactly the control being replaced; a plain `text` input never
 * grows one, leaving only this component's own clear button to show or hide.
 *
 * **One overlay panel, one trigger, at every width — not a permanent
 * desktop rail plus a separate mobile sheet** (client, 2026-08-31: "I want
 * the filter button same in all view modes next to the search bar... it
 * should not push the product cards but be displayed over it on the left
 * side"). The rail that used to occupy its own `lg:grid-cols-[minmax(0,14rem)
 * ...]` column — permanently visible, pushing the results grid over — is
 * gone; the same "Filters" trigger that used to be `lg:hidden` now renders
 * at every width, beside the search input, and opening it always produces
 * the same `fixed` panel over the grid rather than reserving space beside
 * it. `filtersOpen`/`FilterPanel`/`panelProps` are otherwise unchanged from
 * the rail-and-sheet version — only where the panel renders and how it is
 * reached changed, not the filter tree inside it.
 *
 * **The panel's own shape still differs by width, just as two different
 * `fixed` placements of the *same* element rather than two different
 * components.** Below `lg` it is the same partial-height, bottom-anchored,
 * rounded-top sheet this file has carried since the first pass
 * (`max-h-[85vh]`, `rounded-t-2xl`) — briefly replaced with a genuinely
 * full-screen `inset-0` version for one pass (client, 2026-08-31: "In case
 * of mobile view the filter extends from bottom of the page to the top
 * right"), then reverted the same day (client, immediately after: "I want
 * the previous filter in mobile view and not full page"). At `lg` and up,
 * `lg:right-auto lg:w-96` collapses it down to a fixed-width column pinned
 * to the left edge, full height, with the rest of the viewport — and the
 * grid underneath it — visible past its right edge (client, same first
 * message: "in desktop view the filter to extend from left... it should
 * not push the product cards but be displayed over it on the left side") —
 * this part was not reverted. The backdrop button behind it is
 * unconditional at every width: real, clickable space closing the panel on
 * a click either past the mobile sheet's top edge or the desktop panel's
 * right edge.
 *
 * **Only "Search" closes the panel, not "Clear."** "Search" dismisses it
 * onto the already-live-filtered grid beneath it; Escape and the backdrop
 * close it too. A prior pass briefly made "Clear" close it as well (client:
 * "When we click search or clear button the filer goes away"), reversed
 * the same day (client: "lets only have search close the panel") — "Clear"
 * resets every filter but leaves the panel open again, as it always did
 * before that one pass.
 *
 * **The panel gets its own scrollbar from `lg`** (client, earlier pass: "In
 * desktop view the filter on the left dide of the pagee should have its
 * won seperate scroll bar") — a fixed header (`shrink-0`, the two buttons
 * and the count) above a separately scrolling body, so a long filter list
 * scrolls inside the panel instead of the whole overlay growing past the
 * viewport. "Clear"'s hover-pop lives in that fixed header rather than the
 * scrolling body for the same reason `ProductCard`'s add-to-cart-styled pop
 * needed the same split in the old rail: a transform that scales an
 * element past its own box can get sliced by an `overflow-y-auto` ancestor,
 * which clips *both* axes per the CSS Overflow spec's own rule for a lone
 * non-`visible` axis.
 *
 * **Every filter button carries `ProductCard`'s "View details" hover — the
 * colour change and the sweep-underline — with no arrow** (client, first
 * pass: "add the same animation to these buttons as view details on product
 * cards without the ->"). The existing accent-left-border "selected" mark is
 * untouched; the sweep is a layered-on hover effect, not a replacement.
 *
 * **The results grid is four columns wide at the same breakpoint that used
 * to hold three** (client, 2026-08-31: "instead of 3 cards in a row in
 * desktop view lets have 4 cards in a row") — arithmetic, not just
 * preference: with the rail gone, the grid no longer loses 14rem plus a
 * 3rem gutter to it, so the same `xl` breakpoint that used to just fit
 * three `minmax(17.5rem,1fr)` cards beside a rail now comfortably fits four
 * without one.
 */
export function ProductCatalogue({ products }: { products: Product[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const sector = params.get("sector") ?? "all";
  const category = params.get("category") ?? "all";
  const hp = params.get("hp") ?? "all";
  const q = params.get("q") ?? "";

  /* Kept separate from `q` on purpose — see the component note. Synced back
     from `q` (not the other way) so "Clear all" and back/forward navigation
     still reset what the input shows — during render, React's own
     documented pattern for "adjust state when a prop changes" (a `useEffect`
     doing the same `setState` is a render *after* the one the user sees,
     and trips this project's `set-state-in-effect` lint rule besides). */
  const [prevQ, setPrevQ] = useState(q);
  const [searchDraft, setSearchDraft] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    setSearchDraft(q);
  }

  const availableSectors = useMemo(
    () => sectors.filter((s) => products.some((p) => sectorOf(p.category) === s.key)),
    [products],
  );

  /* One lookup, all sectors' categories at once, rather than recomputing per
     row on every render — the tree needs every expandable sector's own list,
     not just the currently-active one. */
  const categoriesBySector = useMemo(() => {
    const map = new Map<string, CategoryMeta[]>();
    for (const s of availableSectors) {
      map.set(
        s.key,
        categoriesInSector(s.key).filter((c) => products.some((p) => p.category === c.key)),
      );
    }
    return map;
  }, [availableSectors, products]);

  /* Ratings offered are those of the products the *other two* filters already
     admit — not every rating in the catalogue. Filtered to Commercial, the
     full list offered "3 HP" and "10 HP" for a range of lighting modules that
     have no rating at all, and picking one emptied the page.

     Note what it does not depend on: `hp` itself. Narrowing the options to the
     current selection would collapse the list to the one already chosen and
     leave no way back. */
  const hpRanges = useMemo(() => {
    const inScope = products.filter(
      (p) =>
        (sector === "all" || sectorOf(p.category) === sector) &&
        (category === "all" || p.category === category),
    );
    return Array.from(new Set(inScope.flatMap((p) => p.hpRanges))).sort((a, b) => {
      const num = (s: string) => parseFloat(s.replace(/[^0-9.]/g, "")) || 0;
      return num(a) - num(b);
    });
  }, [products, sector, category]);

  /* ── Client-side substring filter (instant preview) ─────────── */
  const clientFiltered = useMemo(() => {
    const query = searchDraft.trim().toLowerCase();
    return products.filter(
      (p) =>
        (sector === "all" || sectorOf(p.category) === sector) &&
        (category === "all" || p.category === category) &&
        (hp === "all" || p.hpRanges.includes(hp)) &&
        (query === "" ||
          p.name.toLowerCase().includes(query) ||
          p.tagline.toLowerCase().includes(query) ||
          categoryLabel(p.category).toLowerCase().includes(query) ||
          sectorLabel(sectorOf(p.category) ?? "").toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.features.some((f) => f.toLowerCase().includes(query)) ||
          p.protections.some((key) => {
            const label = protectionMeta[key]?.label ?? "";
            return label.toLowerCase().includes(query) || key.toLowerCase().includes(query);
          }) ||
          p.hpRanges.some((r) => r.toLowerCase().includes(query)) ||
          p.spec.some(
            (s) =>
              s.label.toLowerCase().includes(query) ||
              s.value.toLowerCase().includes(query),
          )),
    );
  }, [products, sector, category, hp, searchDraft]);

  /* ── Server-side fuzzy results (debounced) ───────────────────── */
  const [fuzzyScores, setFuzzyScores] = useState<Map<string, number>>(new Map());
  const [isFuzzyLoading, setIsFuzzyLoading] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const q = searchDraft.trim();
    if (!q) {
      setFuzzyScores(new Map());
      setIsFuzzyLoading(false);
      return;
    }
    setIsFuzzyLoading(true);
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      try {
        const results = await fuzzySearchAction(q);
        if (seqRef.current === seq) {
          setFuzzyScores(new Map(results.map((r) => [r.slug, r.score])));
          setIsFuzzyLoading(false);
        }
      } catch {
        /* Server search failed — client results still showing. */
        if (seqRef.current === seq) setIsFuzzyLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  /* ── Merge: client matches + fuzzy-only matches, ranked by score */
  const filtered = useMemo(() => {
    const query = searchDraft.trim().toLowerCase();

    /* When there is no text query, client-side filters are all we need.
       No server roundtrip. */
    if (!query) return clientFiltered;

    /* Start with all client-side substring matches. */
    const seen = new Set(clientFiltered.map((p) => p.slug));
    const merged = [...clientFiltered];

    /* Add fuzzy-only matches the client missed (typos, partial words),
       still applying the non-text filters so sector/category/hp selection
       is honoured. */
    if (fuzzyScores.size > 0) {
      for (const [slug] of fuzzyScores) {
        if (!seen.has(slug)) {
          const p = products.find((pp) => pp.slug === slug);
          if (
            p &&
            (sector === "all" || sectorOf(p.category) === sector) &&
            (category === "all" || p.category === category) &&
            (hp === "all" || p.hpRanges.includes(hp))
          ) {
            merged.push(p);
            seen.add(slug);
          }
        }
      }
      /* Sort by fuzzy score when available, defaulting exact substring
         matches (which the server may not have scored yet) to 0.5. */
      merged.sort(
        (a, b) => (fuzzyScores.get(b.slug) ?? 0.5) - (fuzzyScores.get(a.slug) ?? 0.5),
      );
    }

    return merged;
  }, [clientFiltered, fuzzyScores, products, searchDraft, sector, category, hp]);

  /* Autocomplete vocabulary — short recognisable terms drawn from sectors,
     categories, product names, protection labels and HP ranges. Built once
     per product list and sorted alphabetically. */
  const vocabulary = useMemo(() => {
    const terms = new Set<string>();
    for (const s of availableSectors) terms.add(s.label);
    for (const cats of categoriesBySector.values()) {
      for (const c of cats) terms.add(c.label);
    }
    for (const p of products) {
      terms.add(p.name);
      for (const r of p.hpRanges) terms.add(r);
      for (const key of p.protections) {
        const meta = protectionMeta[key];
        if (meta) terms.add(meta.label);
      }
    }
    return Array.from(terms).sort();
  }, [products, availableSectors, categoriesBySector]);

  /** Up to 3 autocomplete suggestions that contain the current draft,
   *  excluding exact matches. */
  const suggestions = useMemo(() => {
    const q = searchDraft.trim().toLowerCase();
    if (!q) return [];
    return vocabulary
      .filter((t) => t.split(/\s+/).length <= 3)
      .map((term) => ({ term, score: fuzzyMatchScore(q, term) }))
      .filter((match) => match.score > 0.3 && match.term.toLowerCase() !== q)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((match) => match.term);
  }, [searchDraft, vocabulary]);

  function updateParams(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    const qs = next.toString();
    router.replace(qs ? `/products?${qs}` : "/products", { scroll: false });
  }

  /* Every level below the one just changed gets cleared: a stale category or
     rating left over from a different sector is a filter pair with no
     possible result and no obvious cause. */
  function selectSector(value: string) {
    updateParams((next) => {
      if (value === "all") next.delete("sector");
      else next.set("sector", value);
      next.delete("category");
      next.delete("hp");
    });
  }

  function selectCategory(value: string) {
    updateParams((next) => {
      if (value === "all") next.delete("category");
      else next.set("category", value);
      next.delete("hp");
    });
  }

  function selectHp(value: string) {
    updateParams((next) => {
      if (value === "all") next.delete("hp");
      else next.set("hp", value);
    });
  }

  function commitSearch(value: string) {
    updateParams((next) => {
      const trimmed = value.trim();
      if (trimmed === "") next.delete("q");
      else next.set("q", trimmed);
    });
  }

  function clearSearch() {
    setSearchDraft("");
    commitSearch("");
  }

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen]);

  const activeFilters =
    [sector, category, hp].filter((v) => v !== "all").length +
    (searchDraft.trim() !== "" ? 1 : 0);

  const clearAll = () => {
    router.replace("/products", { scroll: false });
  };

  const countText =
    filtered.length === products.length
      ? `${products.length} product${products.length === 1 ? "" : "s"}`
      : `${filtered.length} of ${products.length} products`;

  const panelProps = {
    availableSectors,
    categoriesBySector,
    hpRanges,
    sector,
    category,
    hp,
    onSelectSector: selectSector,
    onSelectCategory: selectCategory,
    onSelectHp: selectHp,
  };

  return (
    <div>
      <div>
        {/* Search, and the "Filters" trigger beside it, at every width now
            — see the component note. No more `lg:grid` column split to sit
            inside: with the rail gone, this results block is the only
            column there is. */}
        <div className="mb-8 flex items-center gap-3">
          <div className="relative z-20 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 [transform:translateY(-50%)] text-muted" />
            <input
              type="text"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => {
                setSearchFocused(false);
                commitSearch(searchDraft);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setSearchFocused(false);
                  commitSearch(searchDraft);
                  event.currentTarget.blur();
                }
              }}
              placeholder="Search products…"
              aria-label="Search products"
              className="w-full border border-line-strong bg-surface-raised py-2.5 pl-10 pr-14 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
            {/* A text "Clear" rather than an icon (client, this pass: "I
                want a clear button in the search bar as well, at right
                corner, instead of x" — the previous `CloseIcon` glyph still
                read as "an x" rather than as a labelled control). This
                input is `type="text"`, not `type="search"`, so there is no
                native cancel button underneath to also account for. */}
            {isFuzzyLoading ? (
              <span className="absolute right-4 top-1/2 [transform:translateY(-50%)]">
                <SpinnerIcon className="h-4 w-4 text-muted" />
              </span>
            ) : searchDraft.length > 0 ? (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-4 top-1/2 [transform:translateY(-50%)] text-xs font-medium text-muted transition-colors hover:text-ink"
              >
                Clear
              </button>
            ) : null}

            {/* Autocomplete suggestions dropdown — up to 3 terms that
                contain what the visitor has typed, positioned directly below
                the search input. `onMouseDown` with `preventDefault` stops
                the input’s blur from firing before the click registers. */}
            {searchFocused && suggestions.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden border border-line bg-surface-raised shadow-card">
                {suggestions.map((term) => {
                  const q = searchDraft.trim().toLowerCase();
                  const idx = term.toLowerCase().indexOf(q);
                  return (
                    <li key={term}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchDraft(term);
                          commitSearch(term);
                          setSearchFocused(false);
                        }}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-body transition-colors hover:bg-surface-subtle hover:text-ink"
                      >
                        <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                        <span>
                          {idx !== -1 ? (
                            <>
                              {term.slice(0, idx)}
                              <span className="font-medium text-ink">
                                {term.slice(idx, idx + q.length)}
                              </span>
                              {term.slice(idx + q.length)}
                            </>
                          ) : (
                            term
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            className="flex shrink-0 items-center gap-2 border border-line bg-surface-raised px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-line-strong"
          >
            Filters
            {activeFilters > 0 && (
              <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 font-mono text-[0.625rem] tabular-nums text-surface">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {filtered.length > 0 ? (
            <ul className="grid grid-cols-[minmax(17.5rem,1fr)] gap-6 sm:grid-cols-[repeat(2,minmax(17.5rem,1fr))] xl:grid-cols-[repeat(4,minmax(17.5rem,1fr))]">
              {filtered.map((product, index) => (
                <li key={product.id}>
                  <ProductCard product={product} priority={index === 0} headingLevel="h3" />
                </li>
              ))}
            </ul>
          ) : (
            <div className="border border-line py-20 text-center">
              <p className="text-ink">No products match those filters.</p>
              <button
                type="button"
                onClick={clearAll}
                className="mt-3 text-sm font-medium text-accent underline underline-offset-4"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

      {/* The one filter overlay, every width — see the component note for
          the full reasoning. `fixed inset-0` at every breakpoint, unlike
          the old `lg:hidden` version: the panel inside it is what changes
          shape by width, not whether this wrapper renders at all. Plain
          conditional mount, no enter transition — matching `layout/Header`'s
          own mobile drawer, this codebase's one existing precedent for a
          modal panel, which does the same. Escape and the backdrop still
          close it; body scroll is locked while it is open for the same
          reason a background that keeps scrolling behind a panel reads as
          broken. */}
      {filtersOpen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Filters">
          {/* Real, clickable space at every width — closes on a click on
              the dimmed area either past the mobile sheet's top edge or the
              desktop panel's right edge. */}
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/50"
          />
          {/* Back to the previous partial-height bottom sheet below `lg`
              (client, 2026-08-31: "I want the previous filter in mobile
              view and not full page") — the brief full-screen `inset-0`
              version from the prior pass is gone; `max-h-[85vh]` and the
              rounded top corners are exactly what they were before that
              pass. `lg:right-auto lg:w-96` is still the one change at that
              breakpoint, unrelated to this revert: pinned to the left edge,
              full height, a fixed width instead of the viewport (client,
              prior pass: "in desktop view the filter to extend from left...
              it should not push the product cards but be displayed over it
              on the left side"). */}
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-line bg-surface-raised lg:inset-x-auto lg:left-0 lg:right-auto lg:top-0 lg:max-h-none lg:rounded-none lg:border-t-0 lg:border-r lg:w-96">
            {/* Two buttons, not a title and a close icon (client, earlier
                pass: "In mobile view filter lets have 2 buttons at the top
                on the left side clear and on right search"). Only "Search"
                dismisses the panel, onto the grid already live-filtered
                underneath it — "Clear" resets every filter but leaves the
                panel open (client, 2026-08-31: "lets only have search close
                the panel" — a prior pass briefly had Clear close it too;
                that direction was reversed the same day). */}
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="transition-transform duration-200 ease-out [transform:scale(1)] hover:[transform:scale(1.08)]">
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear
                </Button>
              </div>
              <Button variant="primary" size="sm" onClick={() => setFiltersOpen(false)}>
                Search
              </Button>
            </div>
            <p aria-live="polite" className="label-tech border-b border-line px-5 py-3 text-muted">
              {countText}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <FilterPanel {...panelProps} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterPanel({
  availableSectors,
  categoriesBySector,
  hpRanges,
  sector,
  category,
  hp,
  onSelectSector,
  onSelectCategory,
  onSelectHp,
}: {
  availableSectors: { key: string; label: string }[];
  categoriesBySector: Map<string, CategoryMeta[]>;
  hpRanges: string[];
  sector: string;
  category: string;
  hp: string;
  onSelectSector: (value: string) => void;
  onSelectCategory: (value: string) => void;
  onSelectHp: (value: string) => void;
}) {
  return (
    <div>
      {/* Only offered when there is more than one sector to choose between. A
          single-option filter is a label pretending to be a control. */}
      {availableSectors.length > 1 && (
        <div>
          <p className="label-tech text-muted">Category</p>
          <ul role="tree" aria-label="Category" className="mt-3">
            <li>
              <FilterButton active={sector === "all"} onClick={() => onSelectSector("all")}>
                All categories
              </FilterButton>
            </li>
            {availableSectors.map((s) => {
              const isActive = sector === s.key;
              const children = categoriesBySector.get(s.key) ?? [];
              return (
                <li key={s.key}>
                  <FilterButton active={isActive} onClick={() => onSelectSector(s.key)}>
                    {s.label}
                  </FilterButton>
                  {/* No separate "expanded" state — the sector showing its
                      children is always exactly the active sector (client,
                      asked directly: clicking a sector filters and expands
                      in the same click). Switching sectors closes the old
                      list and opens the new one for free. */}
                  {isActive && children.length > 0 && (
                    <ul
                      role="group"
                      aria-label={`${s.label} sub-categories`}
                      className="ml-3 mt-1 border-l border-line pl-3"
                    >
                      <li>
                        <FilterButton
                          active={category === "all"}
                          onClick={() => onSelectCategory("all")}
                        >
                          All sub-categories
                        </FilterButton>
                      </li>
                      {children.map((c) => (
                        <li key={c.key}>
                          <FilterButton
                            active={category === c.key}
                            onClick={() => onSelectCategory(c.key)}
                          >
                            {c.label}
                          </FilterButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Only once a sector is picked (client, second pass: "do not show
          rating when it is in all categories") — the unfiltered list mixes
          ranges from every sector, most of which do not apply to whichever
          one a visitor is actually about to narrow into. */}
      {sector !== "all" && hpRanges.length > 0 && (
        <div className="mt-8">
          <p className="label-tech text-muted">Rating</p>
          <ul role="group" aria-label="Rating" className="mt-3">
            <li>
              <FilterButton active={hp === "all"} onClick={() => onSelectHp("all")}>
                All ratings
              </FilterButton>
            </li>
            {hpRanges.map((r) => (
              <li key={r}>
                <FilterButton active={hp === r} onClick={() => onSelectHp(r)}>
                  {r}
                </FilterButton>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * One filter option. Carries `ProductCard`'s "View details" hover — a
 * colour change plus a sweep-underline — with no arrow (client, 2026-08-27:
 * "add the same animation to these buttons as view details on product cards
 * without the ->"). The accent left border marking a *selected* option is
 * untouched and unrelated: the sweep is a hover effect layered on top of it,
 * not a replacement for it, so an already-selected option still gets the
 * same sweep on hover as any other.
 */
function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`group/filter relative block w-full border-l-2 py-1.5 pl-3 text-left text-sm transition-colors hover:text-accent ${
        active ? "border-accent font-medium text-ink" : "border-transparent text-muted"
      }`}
    >
      <span className="relative">
        {children}
        <span
          aria-hidden
          className="absolute inset-x-0 -bottom-0.5 h-px origin-left bg-accent [transform:scaleX(0)] transition-transform duration-200 ease-out group-hover/filter:[transform:scaleX(1)]"
        />
      </span>
    </button>
  );
}
