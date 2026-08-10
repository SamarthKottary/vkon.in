"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { CategoryRow } from "@/components/product/CategoryRow";
import { categories } from "@/content/taxonomy";
import type { Product } from "@/lib/types";

/**
 * Filterable catalogue.
 *
 * Filter state lives in the URL so a filtered view is shareable and the footer's
 * `/products?category=starter` links land pre-filtered. Only categories that
 * actually contain products are offered — an empty filter is a dead end.
 */
export function ProductCatalogue({ products }: { products: Product[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const category = params.get("category") ?? "all";
  const hp = params.get("hp") ?? "all";

  const availableCategories = useMemo(
    () => categories.filter((c) => products.some((p) => p.category === c.key)),
    [products],
  );

  const hpRanges = useMemo(
    () =>
      Array.from(new Set(products.flatMap((p) => p.hpRanges))).sort((a, b) => {
        const num = (s: string) => parseFloat(s.replace(/[^0-9.]/g, "")) || 0;
        return num(a) - num(b);
      }),
    [products],
  );

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === "all" || p.category === category) &&
          (hp === "all" || p.hpRanges.includes(hp)),
      ),
    [products, category, hp],
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

  function setFilter(key: "category" | "hp", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete(key);
    else next.set(key, value);
    const q = next.toString();
    router.replace(q ? `/products?${q}` : "/products", { scroll: false });
  }

  return (
    <div>
      {/* Each CategoryRow supplies its own h2, so the heading order runs
          h1 (masthead) → h2 (category) → h3 (product) without a gap. */}
      <div className="border-y border-line">
        <FilterRow
          label="Category"
          options={[
            { value: "all", label: "All" },
            ...availableCategories.map((c) => ({ value: c.key, label: c.label })),
          ]}
          active={category}
          onSelect={(v) => setFilter("category", v)}
        />
        {hpRanges.length > 0 && (
          <FilterRow
            label="Rating"
            options={[
              { value: "all", label: "Any" },
              ...hpRanges.map((r) => ({ value: r, label: r })),
            ]}
            active={hp}
            onSelect={(v) => setFilter("hp", v)}
            bordered
          />
        )}
      </div>

      <p aria-live="polite" className="label-tech py-6 text-muted">
        {filtered.length === products.length
          ? `${products.length} product${products.length === 1 ? "" : "s"}`
          : `${filtered.length} of ${products.length} products`}
      </p>

      {groups.length > 0 ? (
        <div className="flex flex-col gap-14">
          {groups.map((group, index) => (
            <CategoryRow
              key={group.category.key}
              category={group.category}
              products={group.items}
              lead="heading"
              headingLevel="h2"
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
  );
}

function FilterRow({
  label,
  options,
  active,
  onSelect,
  bordered = false,
}: {
  label: string;
  options: { value: string; label: string }[];
  active: string;
  onSelect: (value: string) => void;
  bordered?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:gap-6 ${
        bordered ? "border-t border-line" : ""
      }`}
    >
      <span className="label-tech shrink-0 text-muted sm:w-20">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-x-6 gap-y-2">
        {options.map((option) => {
          const isActive = active === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(option.value)}
              className={`border-b-2 pb-0.5 text-sm transition-colors ${
                isActive
                  ? "border-accent font-medium text-ink"
                  : "border-transparent text-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
