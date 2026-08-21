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
 *  - **Exactly one card is ever popped.** Whichever card's own centre sits
 *    closest to the track's centre is popped by default — checked by
 *    measuring rects on scroll and resize, the same way `sync` below already
 *    measures for the paging arrows, so there is always a popped card even
 *    when the mouse is resting outside the track altogether. Pointing at a
 *    *different* card overrides it: `hoveredId` wins over the centred one
 *    whenever it is set, so hovering never leaves two cards popped at once.
 *
 *    (An earlier build used `IntersectionObserver` with a narrowed root
 *    margin instead. It only reports an intersection change on crossing one
 *    of a fixed set of ratio thresholds, so a card change mid-scroll could go
 *    unreported until the ratio happened to cross one — this direct measure
 *    has no such gap.)
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
  const [centeredId, setCenteredId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /* A touch tap can fire a stray `mouseenter` with no matching `mouseleave`,
     which would stick `hoveredId` on whatever card was first touched and
     hide the border from the card actually centred afterwards. Trusting it
     only where hover genuinely exists keeps every other device on the
     centred card, which a swipe does keep up to date. */
  const [hoverCapable, setHoverCapable] = useState(false);

  useEffect(() => {
    setHoverCapable(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  const poppedId = hoverCapable ? (hoveredId ?? centeredId) : centeredId;

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });

    const trackMid = el.getBoundingClientRect().left + el.clientWidth / 2;
    let bestId: string | null = null;
    let bestDistance = Infinity;
    for (const card of el.querySelectorAll<HTMLElement>("[data-product-id]")) {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - trackMid);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = card.dataset.productId ?? null;
      }
    }
    setCenteredId(bestId);
  }, []);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync, products.length]);

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
            onMouseEnter={() => setHoveredId(product.id)}
            onMouseLeave={() => setHoveredId(null)}
            className={`relative w-[82%] flex-none snap-center rounded-[2px] transition-[transform,box-shadow,outline-color] duration-300 ease-out sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)] ${
              poppedId === product.id
                ? "z-10 -translate-y-2.5 scale-[1.05] outline outline-2 -outline-offset-2 outline-accent shadow-card-hover"
                : "z-0 outline outline-2 -outline-offset-2 outline-transparent"
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
