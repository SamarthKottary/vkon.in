"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons/ui";
import { ProductCard } from "@/components/product/ProductCard";
import type { Product } from "@/lib/types";

/**
 * Horizontal carousel of related products for the product detail page.
 *
 * Same idiom as the home page sector browser: a horizontal `hscroll` track
 * with paging arrows above, right-aligned, disabled at the ends and hidden
 * when the whole list already fits. Fixed proportional card widths so a fourth
 * product adds a card to scroll to rather than shrinks the visible three.
 *
 * Kept as its own client component because the paging arrows need `useState`,
 * `useRef` and a `ResizeObserver`. The parent page stays a server component
 * and does the filtering.
 */
export function RelatedProducts({
  heading,
  products,
}: {
  heading: string;
  products: Product[];
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({
      left: el.scrollLeft > 4,
      right: el.scrollLeft < max - 4,
    });
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
    const step = first ? first.getBoundingClientRect().width + 24 : el.clientWidth;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  const showArrows = canScroll.left || canScroll.right;

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-2xl sm:text-3xl">{heading}</h2>

        {showArrows && (
          <div className="flex items-center gap-3">
            <PageButton
              label="Previous products"
              disabled={!canScroll.left}
              onClick={() => page(-1)}
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </PageButton>
            <PageButton
              label="More products"
              disabled={!canScroll.right}
              onClick={() => page(1)}
            >
              <ArrowRightIcon className="h-4 w-4" />
            </PageButton>
          </div>
        )}
      </div>

      <ul
        ref={trackRef}
        onScroll={sync}
        className="hscroll mt-8 flex snap-x snap-mandatory items-stretch gap-6 overflow-x-auto"
      >
        {products.map((item) => (
          <li
            key={item.id}
            className="w-[82%] flex-none snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]"
          >
            <ProductCard product={item} headingLevel="h3" />
          </li>
        ))}
      </ul>
    </div>
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
      className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-raised text-ink transition-colors hover:border-ink disabled:cursor-default disabled:border-line disabled:text-muted disabled:opacity-40"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
