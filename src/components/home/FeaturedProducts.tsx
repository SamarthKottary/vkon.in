"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons/ui";
import { ProductCard } from "@/components/product/ProductCard";
import type { Product } from "@/lib/types";

/**
 * "Featured products" — a horizontal, centre-snapping row.
 *
 * Same `hscroll` track idiom as `SectorBrowser`/`ProductRow`, with three
 * things those don't need, all asked for together because they serve one
 * effect — the centred card reading as the one currently "picked up":
 *
 *  - **Snap is `center`, not `start`.** The other tracks line a card up
 *    against the left edge; this one settles it in the middle, which is
 *    also the frame the "which card is active" check below reads from.
 *  - **A vertical mouse wheel pages the row.** Trackpads already send a
 *    horizontal delta on a two-finger swipe and need no help; a plain mouse
 *    wheel only ever sends a vertical one, which a horizontal-only track
 *    otherwise ignores completely.
 *  - **The active card scales and lifts, on hover or centred by a swipe.**
 *    A mouse never rests "in the middle" of a touch scroller, so touch gets
 *    its own trigger: `IntersectionObserver` against a narrow centre band of
 *    the track, watching for whichever card is currently sat in it.
 *
 * The track carries generous vertical padding rather than `overflow-visible`
 * — horizontal scrolling needs `overflow-x: auto`, and the CSS overflow
 * rules compute the other axis to `auto` too the moment one axis isn't
 * `visible`, so the lifted card would clip against the track's own edge
 * without room either side to rise into.
 */
export function FeaturedProducts({ products }: { products: Product[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  const [activeId, setActiveId] = useState<string | null>(null);

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

  /* Whichever card sits in the middle fifth of the track counts as active —
     narrow enough that two neighbours are never both inside it at once, wide
     enough to hold a card through the small overshoot a snap settles from. */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const ratios = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.productId;
          if (!id) continue;
          ratios.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }

        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        setActiveId(bestRatio > 0 ? bestId : null);
      },
      { root: el, rootMargin: "0px -40% 0px -40%", threshold: [0, 0.5, 1] },
    );

    for (const card of el.querySelectorAll<HTMLElement>("[data-product-id]")) {
      observer.observe(card);
    }

    return () => observer.disconnect();
  }, [products.length]);

  /** Pages by one card, measured from the DOM so it follows the breakpoint. */
  const page = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 24 : el.clientWidth;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  /** A plain mouse wheel's vertical delta pages the row; a trackpad's own
   *  horizontal delta is left alone so its native momentum keeps working. */
  const onWheel = (event: React.WheelEvent<HTMLUListElement>) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.currentTarget.scrollBy({ left: event.deltaY });
    event.preventDefault();
  };

  if (products.length === 0) return null;

  const showArrows = canScroll.left || canScroll.right;

  return (
    <div>
      {showArrows && (
        <div className="mb-6 flex items-center justify-end gap-3">
          <PageButton
            label="Previous featured product"
            disabled={!canScroll.left}
            onClick={() => page(-1)}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </PageButton>
          <PageButton
            label="More featured products"
            disabled={!canScroll.right}
            onClick={() => page(1)}
          >
            <ArrowRightIcon className="h-4 w-4" />
          </PageButton>
        </div>
      )}

      <ul
        ref={trackRef}
        onScroll={sync}
        onWheel={onWheel}
        aria-label="Featured products"
        className="hscroll flex snap-x snap-mandatory items-stretch gap-6 overflow-x-auto px-1 py-4"
      >
        {products.map((product, index) => (
          <li
            key={product.id}
            data-product-id={product.id}
            className={`w-[82%] flex-none snap-center transition-[transform,box-shadow] duration-300 ease-out sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)] ${
              activeId === product.id
                ? "-translate-y-2.5 scale-[1.05] shadow-card-hover"
                : "hover:-translate-y-2.5 hover:scale-[1.05] hover:shadow-card-hover"
            }`}
          >
            <ProductCard product={product} priority={index === 0} />
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
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-raised text-ink transition-colors hover:border-ink disabled:cursor-default disabled:text-muted disabled:opacity-40"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
