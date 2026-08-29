"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightIcon, SearchIcon } from "@/components/icons/ui";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { Container } from "@/components/ui/Container";
import { categoryLabel, sectors, sectorOf } from "@/content/taxonomy";

export type SearchEntry = {
  slug: string;
  name: string;
  category: string;
  /** First product image, or `null` for one with none yet. */
  image: string | null;
  searchContent: string;
};

/** Shown inline; the rest are reachable via "View all results" onto
 *  `/products`, which already has the full filtered grid and needs no
 *  duplicate of that here. */
const MAX_RESULTS = 6;

/**
 * The search icon in the header, and the panel it opens — same shape as
 * `ProductsMenu` next to it (full-width dropdown under the header, Escape
 * and an outside click both close it, a followed link closes it too rather
 * than leaving it open over the new page), because that is this header's
 * own, already-established pattern for "a button that opens a panel" and a
 * second, differently-behaved one would be its own inconsistency.
 *
 * **Client, 2026-08-27, two messages: "add a search icon before cart
 * button on top of page", then "I should be able to search there and see
 * the list of products as well"** — the first pass shipped a plain link to
 * `/products`; this is what replaced it once "search there" turned out to
 * mean typing in place, not just landing on the page that has its own
 * search.
 *
 * **`products` is a lightweight index, not the full catalogue** — `slug`,
 * `name`, `category`, one image URL, nothing else (no tagline, no
 * description, no spec rows). `(site)/layout.tsx` already calls
 * `listProducts()` once for `ProductsMenu`'s own category counts; this
 * reuses that same call rather than a second query, and only ships the
 * fields this panel actually renders — the same restraint that comment
 * already argues for its own `menu` prop, extended to this one.
 *
 * **Matches on name only, not name and tagline the way `/products`' own
 * search does.** That page's search filters an already-loaded grid the
 * visitor is looking at; this one is a quick jump from anywhere on the
 * site, and a tagline match surfacing a product whose *name* shares
 * nothing with what was typed reads as a wrong result in a six-row preview
 * in a way it does not in a full page of cards with their own copy
 * underneath explaining the match.
 */
export function HeaderSearch({
  products,
  suggestionTerms = [],
  open,
  onToggle,
  onClose,
}: {
  products: SearchEntry[];
  /** Short recognisable terms (sector labels, category names, protection
   *  titles, product names, HP ranges) for Google-style autocomplete. */
  suggestionTerms?: string[];
  /* Lifted to `Header`, same as `ProductsMenu`'s own `open` — controlled
     from there rather than kept local, because the header's hide-on-scroll
     behaviour has to know whether this panel is open too, for the same
     reason it already has to know about `ProductsMenu`'s. */
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedSector, setSelectedSector] = useState("all");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const sectorMatch = selectedSector === "all" || sectorOf(p.category) === selectedSector;
      if (!sectorMatch) return false;
      if (!q) return false;
      return p.searchContent.includes(q);
    });
  }, [products, query, selectedSector]);

  /** Up to 3 autocomplete suggestions whose text contains the current query,
   *  excluding exact matches (the visitor already typed it), and limited to 3 words. */
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return suggestionTerms
      .filter((t) => t.split(/\s+/).length <= 3)
      .filter((t) => t.toLowerCase().includes(q) && t.toLowerCase() !== q)
      .slice(0, 3);
  }, [suggestionTerms, query]);

  const close = useCallback(() => {
    onClose();
    setQuery("");
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  const trimmed = query.trim();
  const shown = matches.slice(0, MAX_RESULTS);

  /* With no index to search — the root 404 renders the header outside the
     route group that loads it, same reasoning `ProductsMenu` already
     documents for its own identical bail-out — this degrades to a plain
     link rather than a magnifying glass that can only ever say "no
     results" for every query typed into it. */
  if (products.length === 0) {
    return (
      <Link
        href="/products"
        aria-label="Search products"
        className="inline-flex h-11 w-11 items-center justify-center text-ink transition-colors hover:text-accent"
      >
        <SearchIcon className="h-5 w-5" />
      </Link>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open ? close : onToggle}
        aria-expanded={open}
        aria-controls="header-search-panel"
        className="inline-flex h-11 w-11 items-center justify-center text-ink transition-colors hover:text-accent"
      >
        <SearchIcon className="h-5 w-5" />
        <span className="sr-only">Search products</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          id="header-search-panel"
          className="absolute inset-x-0 top-full border-b border-line bg-surface-raised shadow-card-hover"
        >
          <Container size="wide">
            <div className="py-6">
              <div className="flex w-full flex-col sm:flex-row border border-line-strong bg-surface">
                <select
                  value={selectedSector}
                  onChange={(event) => setSelectedSector(event.target.value)}
                  className="bg-surface px-4 py-3 text-sm text-ink border-b sm:border-b-0 sm:border-r border-line-strong focus:outline-none"
                  aria-label="Filter by category"
                >
                  <option value="all">All categories</option>
                  {sectors.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search products…"
                  aria-label="Search products"
                  className="w-full bg-transparent px-4 py-3 text-base text-ink placeholder:text-muted focus:outline-none"
                />
              </div>

              {/* Autocomplete suggestions — up to 3 short terms that
                  complete what the visitor has typed so far, rendered as
                  clickable chips between the input and the product results.
                  Clicking one fills the input instantly. */}
              {suggestions.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {suggestions.map((term) => {
                    const q = query.trim().toLowerCase();
                    const idx = term.toLowerCase().indexOf(q);
                    return (
                      <li key={term}>
                        <button
                          type="button"
                          onClick={() => setQuery(term)}
                          className="flex items-center gap-1.5 border border-line bg-surface px-3 py-1.5 text-sm text-body transition-colors hover:border-accent hover:text-ink"
                        >
                          <SearchIcon className="h-3 w-3 shrink-0 text-muted" />
                          <span>
                            {term.slice(0, idx)}
                            <span className="font-medium text-ink">
                              {term.slice(idx, idx + q.length)}
                            </span>
                            {term.slice(idx + q.length)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {trimmed !== "" && (
                <div className="mt-5">
                  {shown.length > 0 ? (
                    <>
                      {/* Was `divide-y divide-line` rows with no border of
                          their own; each row is now its own bordered box
                          (client, 2026-08-27: "when i hover the cursor over
                          it, i want a pop up animation or a green border on
                          it" — border chosen over a scale-pop specifically
                          because the client flagged the exact edge-clipping
                          risk a pop carries, which this file's own "Clear
                          all" button hit and had to be restructured to fix
                          two entries above; a border changing colour has no
                          such risk, needing no analogous restructuring
                          here). `border-transparent` at rest, not no
                          border, so the colour change on hover costs no
                          layout shift — the border occupies the same 1px
                          always. */}
                      <ul className="flex flex-col gap-2">
                        {shown.map((p) => (
                          <li key={p.slug}>
                            <Link
                              href={`/products/${p.slug}`}
                              onClick={close}
                              className="flex items-center gap-3 border border-transparent p-3 transition-colors hover:border-accent hover:bg-surface-subtle"
                            >
                              {p.image ? (
                                <Image
                                  src={p.image}
                                  alt=""
                                  width={48}
                                  height={48}
                                  className="h-12 w-12 shrink-0 border border-line object-cover"
                                />
                              ) : (
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-line bg-surface-subtle">
                                  <PanelPlaceholder className="h-6 w-6" />
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium text-ink">{p.name}</p>
                                <p className="label-tech text-muted">
                                  {categoryLabel(p.category)}
                                </p>
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {matches.length > MAX_RESULTS && (
                        /* No count in the label — this panel matches on
                           name only (see the component note on why), but
                           `/products`' own search also matches tagline, so
                           the destination can genuinely show more results
                           than this panel counted. Promising a number the
                           next page might not match is worse than not
                           promising one.

                           `product/ProductCard`'s "View details" sweep
                           (client, 2026-08-27: "Lets make the view all
                           products button in search have the same
                           animation as in view details in product card"),
                           replacing what had been a plain, always-
                           underlined green link — the same swap this
                           pattern has already made everywhere else on the
                           site it reads that way. */
                        <Link
                          href={`/products?q=${encodeURIComponent(trimmed)}${selectedSector !== "all" ? `&sector=${selectedSector}` : ""}`}
                          onClick={close}
                          className="group/all relative mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink transition-colors hover:text-accent"
                        >
                          <span className="relative">
                            View all results
                            <span
                              aria-hidden
                              className="absolute inset-x-0 -bottom-0.5 h-px origin-left bg-accent [transform:scaleX(0)] transition-transform duration-200 ease-out group-hover/all:[transform:scaleX(1)]"
                            />
                          </span>
                          <ArrowRightIcon className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover/all:[transform:translateX(0.25rem)]" />
                        </Link>
                      )}
                    </>
                  ) : (
                    <p className="py-4 text-center text-sm text-muted">
                      No products found for "{trimmed}"{selectedSector !== "all" ? " in this category" : ""}.
                    </p>
                  )}
                </div>
              )}
            </div>
          </Container>
        </div>
      )}
    </>
  );
}
