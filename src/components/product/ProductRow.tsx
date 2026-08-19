"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons/ui";
import { ProductCard } from "@/components/product/ProductCard";
import type { CategoryMeta, Product } from "@/lib/types";

/**
 * One category on the catalogue: a heading, paging arrows, and a horizontal
 * track of wide cards.
 *
 * The arrows sit on the heading row rather than below the track, so every
 * category has its control in the same place and the eye does not hunt. They
 * disable at the ends instead of vanishing — a control that moves is worse than
 * one that is briefly inert — and the whole group is hidden when the row
 * already fits, since it could then never do anything.
 *
 * Scrolling is native with snap points; the arrows page by exactly one card,
 * measured from the DOM so the step follows the breakpoint rather than a
 * hard-coded width.
 */
export function ProductRow({
  category,
  products,
  priority = false,
}: {
  category: CategoryMeta;
  products: Product[];
  priority?: boolean;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync, products.length]);

  const page = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 16 : el.clientWidth;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  const showArrows = canScroll.left || canScroll.right;
  const headingId = `catalogue-${category.key}`;

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 id={headingId} className="text-xl leading-snug sm:text-2xl">
            {category.label}
          </h2>
          <p className="label-tech text-muted">
            {`${products.length} product${products.length === 1 ? "" : "s"}`}
          </p>
        </div>

        {showArrows && (
          <div className="flex items-center gap-2">
            <PageButton
              label={`Previous ${category.label}`}
              disabled={!canScroll.left}
              onClick={() => page(-1)}
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </PageButton>
            <PageButton
              label={`More ${category.label}`}
              disabled={!canScroll.right}
              onClick={() => page(1)}
            >
              <ArrowRightIcon className="h-4 w-4" />
            </PageButton>
          </div>
        )}
      </div>

      {/* Cards render vertical, sized to the same proportions as the
          `RelatedProducts` carousel on the product detail page. Below `lg`
          they lay out in **two rows**, filling column-first — the second
          product sits below the first, the third to the right of the first,
          then below, and so on — so a narrow viewport shows twice as many
          cards without scrolling as far. At `lg` and up they collapse back
          to one row, side by side, keeping the desktop showcase feel. */}
      <ul
        ref={trackRef}
        onScroll={sync}
        className="hscroll mt-5 grid snap-x snap-mandatory grid-flow-col grid-rows-2 items-stretch gap-6 overflow-x-auto auto-cols-[82%] sm:auto-cols-[calc((100%-1.5rem)/2)] lg:auto-cols-[calc((100%-3rem)/3)] lg:grid-rows-1"
      >
        {products.map((product, index) => (
          <li key={product.id} className="snap-start">
            <ProductCard product={product} priority={priority && index === 0} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-raised text-ink transition-colors hover:border-ink disabled:cursor-default disabled:text-muted disabled:opacity-40"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
