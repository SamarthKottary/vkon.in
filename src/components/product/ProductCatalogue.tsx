"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ProductRow } from "@/components/product/ProductRow";
import { categories, sectorOf, sectors } from "@/content/taxonomy";
import type { Product } from "@/lib/types";

/**
 * Filterable catalogue.
 *
 * Filter state lives in the URL so a filtered view is shareable and the footer's
 * `/products?category=starter` links land pre-filtered. Only categories that
 * actually contain products are offered — an empty filter is a dead end.
 *
 * Three filters, in the order the taxonomy reads: **category**, then
 * **sub-category** inside it, then **rating**. Picking a category narrows the
 * sub-category list and clears any sub-category from another one — without
 * that, `?sector=commercial&category=starter` is reachable by clicking two
 * plausible things in sequence and shows nothing.
 *
 * Note the vocabulary split, because it is a trap: the URL and the code call
 * these `sector` and `category`, the labels call them "category" and
 * "sub-category". The client renamed the user-facing words on 2026-08-19;
 * renaming the query parameters too would have broken every link already
 * shared or indexed, so the internal names stayed.
 *
 * Filters sit in a left rail on desktop and collapse above the results on a
 * phone, where there is no room for two columns. The rail is sticky so the
 * filters stay reachable while the results scroll past them.
 */
export function ProductCatalogue({ products }: { products: Product[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const sector = params.get("sector") ?? "all";
  const category = params.get("category") ?? "all";
  const hp = params.get("hp") ?? "all";

  const availableSectors = useMemo(
    () => sectors.filter((s) => products.some((p) => sectorOf(p.category) === s.key)),
    [products],
  );

  /* Categories that have products AND sit in the chosen market. The second
     condition is what stops the rail offering a filter that can only ever
     return nothing once a market is picked. */
  const availableCategories = useMemo(
    () =>
      categories.filter(
        (c) =>
          products.some((p) => p.category === c.key) &&
          (sector === "all" || c.sector === sector),
      ),
    [products, sector],
  );

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

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (sector === "all" || sectorOf(p.category) === sector) &&
          (category === "all" || p.category === category) &&
          (hp === "all" || p.hpRanges.includes(hp)),
      ),
    [products, sector, category, hp],
  );

  /* Rendered as one horizontal row per category rather than a single grid, so
     the range reads as a set of families instead of an undifferentiated wall.
     Categories with nothing in them after filtering are dropped, not shown
     empty. */
  const groups = useMemo(
    () =>
      categories
        .map((c) => ({
          category: c,
          items: filtered.filter((p) => p.category === c.key),
        }))
        .filter((g) => g.items.length > 0),
    [filtered],
  );

  function setFilter(key: "sector" | "category" | "hp", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete(key);
    else next.set(key, value);

    /* Changing category drops the sub-category, which almost certainly belonged
       to the old one. Leaving it produces a filter pair with no possible result
       and no obvious cause. The rating goes with either, for the same reason —
       and unlike the others it would otherwise stay active while no longer
       appearing in the rail, which is a filter you cannot see to clear. */
    if (key === "sector") next.delete("category");
    if (key === "sector" || key === "category") next.delete("hp");

    const q = next.toString();
    router.replace(q ? `/products?${q}` : "/products", { scroll: false });
  }

  return (
    <div /* `minmax(0,1fr)` for the results, not `1fr`. A bare `1fr` is
         `minmax(auto,1fr)`, and `auto` refuses to shrink below the column's
         min-content width — which for a horizontal scroller is the width of
         all its cards. The results column then expands and crushes the rail
         into a two-character ribbon. */
      className="lg:grid lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:gap-12">
      {/* The rail. `self-start` stops it stretching to the grid row height,
          which would break `sticky`. */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        {/* Only offered when there is more than one to choose between. A
            single-option filter is a label pretending to be a control. */}
        {availableSectors.length > 1 && (
          <FilterGroup
            label="Category"
            className="mb-8"
            options={[
              { value: "all", label: "All categories" },
              ...availableSectors.map((s) => ({ value: s.key, label: s.label })),
            ]}
            active={sector}
            onSelect={(v) => setFilter("sector", v)}
          />
        )}

        <FilterGroup
          label="Sub-category"
          options={[
            { value: "all", label: "All sub-categories" },
            ...availableCategories.map((c) => ({ value: c.key, label: c.label })),
          ]}
          active={category}
          onSelect={(v) => setFilter("category", v)}
        />

        {hpRanges.length > 0 && (
          <FilterGroup
            label="Rating"
            className="mt-8"
            options={[
              { value: "all", label: "All ratings" },
              ...hpRanges.map((r) => ({ value: r, label: r })),
            ]}
            active={hp}
            onSelect={(v) => setFilter("hp", v)}
          />
        )}

        <p aria-live="polite" className="label-tech mt-8 border-t border-line pt-5 text-muted">
          {filtered.length === products.length
            ? `${products.length} product${products.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${products.length} products`}
        </p>
      </aside>

      <div className="mt-10 lg:mt-0">
        {groups.length > 0 ? (
          <div className="flex flex-col gap-14">
            {groups.map((group, index) => (
              <ProductRow
                key={group.category.key}
                category={group.category}
                products={group.items}
                priority={index === 0}
              />
            ))}
          </div>
        ) : (
          <div className="border border-line py-20 text-center">
            <p className="text-ink">No products match those filters.</p>
            <button
              type="button"
              onClick={() => router.replace("/products", { scroll: false })}
              className="mt-3 text-sm font-medium text-accent underline underline-offset-4"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  active,
  onSelect,
  className = "",
}: {
  label: string;
  options: { value: string; label: string }[];
  active: string;
  onSelect: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="label-tech text-muted">{label}</p>
      <ul role="group" aria-label={label} className="mt-3 flex flex-wrap gap-x-4 gap-y-1 lg:block">
        {options.map((option) => {
          const isActive = active === option.value;
          return (
            <li key={option.value}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelect(option.value)}
                /* Left rule rather than a pill: the accent bar marks the active
                   row without turning the rail into a set of buttons. */
                className={`w-full border-l-2 py-1.5 text-left text-sm transition-colors lg:pl-3 ${
                  isActive
                    ? "border-accent font-medium text-ink"
                    : "border-transparent text-muted hover:text-ink lg:hover:border-line-strong"
                }`}
              >
                {option.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
