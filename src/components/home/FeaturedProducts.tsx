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
 *  - **Exactly one card is ever popped, and only while this section itself is
 *    in view.** Scrolling the *page* to reach the section pops the centred
 *    card; scrolling past it and away un-pops it — arriving is what "reaches"
 *    a card here, not pointing at the row. An `IntersectionObserver` on the
 *    section root (not the track) drives that, separately from the one below
 *    that finds which card is centred. From there, whichever card's own
 *    centre sits closest to the track's centre is popped by default, checked
 *    by measuring rects on scroll and resize, the same way `sync` below
 *    already measures for the paging arrows. Pointing at a *different* card
 *    overrides it: `hoveredId` wins over the centred one whenever it is set,
 *    so hovering never leaves two cards popped at once.
 *
 *    (An earlier build used the narrowed-root-margin `IntersectionObserver`
 *    trick for the centred-card check too, and a plain "has the visitor done
 *    anything yet" flag for the section-in-view check. The first only reports
 *    an intersection change on crossing one of a fixed set of ratio
 *    thresholds, so a card change mid-scroll could go unreported until the
 *    ratio happened to cross one — this direct measure has no such gap. The
 *    second stayed popped forever once set, rather than un-popping on leaving
 *    the section, which is what this component is for.)
 *
 * The track carries generous vertical padding rather than `overflow-visible`
 * — horizontal scrolling needs `overflow-x: auto`, and the CSS overflow
 * rules compute the other axis to `auto` too the moment one axis isn't
 * `visible`, so the lifted card would clip against the track's own edge
 * without room either side to rise into.
 */
export function FeaturedProducts({ products }: { products: Product[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  const [centeredId, setCenteredId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /* Whether the section itself is in the viewport — see the comment on the
     component for why this, and not an interaction flag, gates the pop. */
  const [inView, setInView] = useState(false);
  /* A touch tap can fire a stray `mouseenter` with no matching `mouseleave`,
     which would stick `hoveredId` on whatever card was first touched and
     hide the border from the card actually centred afterwards. Trusting it
     only where hover genuinely exists keeps every other device on the
     centred card, which a swipe does keep up to date. */
  const [hoverCapable, setHoverCapable] = useState(false);

  useEffect(() => {
    setHoverCapable(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const poppedId = inView ? (hoverCapable ? hoveredId ?? centeredId : centeredId) : null;

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });

    /* A scroll can shift a different card under a cursor that never itself
       moved — the wheel handler below does exactly that — and browsers do
       not re-fire `mouseenter`/`mouseleave` just because content moved under
       a stationary pointer. Clearing it here stops that stale hover from
       masking the centred card's border until the mouse genuinely moves. */
    setHoveredId(null);

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
    <div ref={rootRef}>
      {/* Heading and arrows as flex siblings in one row — same idiom as
          `RecentlyViewed` — rather than the arrows stacked in their own block
          beneath the heading, which is what left a tall gap above the track. */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl leading-snug sm:text-2xl">Featured products</h2>
          <p className="mt-2 text-sm text-muted">
            A handful pulled out from the catalogue.
          </p>
        </div>

        {showArrows && (
          <div className="flex items-center gap-3">
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
      </div>

      <ul
        ref={trackRef}
        onScroll={sync}
        onWheel={onWheel}
        aria-label="Featured products"
        className="hscroll mt-8 flex snap-x snap-mandatory items-stretch gap-6 overflow-x-auto px-1 py-4"
      >
        {products.map((product, index) => (
          <li
            key={product.id}
            data-product-id={product.id}
            onMouseEnter={() => setHoveredId(product.id)}
            onMouseLeave={() => setHoveredId(null)}
            className={`relative w-[82%] flex-none snap-center sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)] ${
              poppedId === product.id ? "z-10" : "z-0"
            }`}
          >
            {/* The pop transform sits on this inner layer, never on the `<li>`
                that carries the hover handlers: scaling and lifting the hover
                target itself moves its edge out from under the pointer, which
                fires `mouseleave` → `mouseenter` in a loop — the border flicked
                back to the centred card and back again, worst on the last card
                near the track edge. The `<li>` only toggles z-index (no reflow,
                no jitter); this layer pops. `transition` (not a `transform`-only
                list) because v4's `scale`/`translate` are their own properties. */}
            <div
              className={`h-full rounded-[2px] transition duration-300 ease-out ${
                poppedId === product.id
                  ? "-translate-y-2.5 scale-[1.05] outline outline-2 -outline-offset-2 outline-accent shadow-card-hover"
                  : "outline outline-2 -outline-offset-2 outline-transparent"
              }`}
            >
              <ProductCard product={product} priority={index === 0} />
            </div>
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
