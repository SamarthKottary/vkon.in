"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons/ui";
import { ProductCard } from "@/components/product/ProductCard";
import {
  getRecentServerSnapshot,
  getRecentSnapshot,
  parseRecent,
  subscribeRecent,
} from "@/lib/recent";
import type { Product } from "@/lib/types";

/** Never more than a row's worth, however many are remembered. */
const SHOWN = 6;

/**
 * "Recently viewed", read from the visitor's own browser.
 *
 * `useSyncExternalStore` rather than `useEffect` + `setState`. localStorage is
 * exactly what that hook is for — an external store the server cannot see — and
 * it is also what the lint rule `react-hooks/set-state-in-effect` pushes you
 * towards. `getServerSnapshot` returns an empty string, so the server renders
 * nothing and hydration matches; the real value arrives on the first client
 * render after that.
 *
 * The snapshot is the raw string, not a parsed array: returning a fresh array
 * from `getSnapshot` would be a new reference every call and re-render forever.
 * Parsing happens in the `useMemo` below.
 *
 * `products` is the live published catalogue. Stored slugs are resolved against
 * it, so anything renamed, unpublished or deleted drops out on its own rather
 * than linking to a 404.
 *
 * **Presentation matches the other carousels on the site** (`SectorBrowser`,
 * `RelatedProducts`): a horizontal `hscroll` track with paging arrows above,
 * right-aligned, disabled at the ends and hidden when the whole list fits.
 * Fixed proportional card widths so a card added to the history adds a card
 * to scroll to rather than shrinks the visible three.
 *
 * **The centred card lifts and scales**, same idiom as `home/FeaturedProducts`
 * — hover on a mouse, or whichever card `IntersectionObserver` finds sat in
 * the track's middle fifth on a touch swipe, since touch has no hover to key
 * off. See that component's comment for why the track takes vertical padding
 * rather than `overflow-visible` and why a plain wheel needs its own handler.
 */
export function RecentlyViewed({ products }: { products: Product[] }) {
  const raw = useSyncExternalStore<string | null>(
    subscribeRecent,
    getRecentSnapshot,
    getRecentServerSnapshot,
  );

  const recent = useMemo(() => {
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    return parseRecent(raw ?? "")
      .map((slug) => bySlug.get(slug))
      .filter((p): p is Product => Boolean(p))
      .slice(0, SHOWN);
  }, [raw, products]);

  const trackRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  const [activeId, setActiveId] = useState<string | null>(null);

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
  }, [sync, recent.length]);

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
  }, [recent]);

  const page = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 16 : el.clientWidth;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  /** A plain mouse wheel's vertical delta pages the row; a trackpad's own
   *  horizontal delta is left alone so its native momentum keeps working. */
  const onWheel = (event: React.WheelEvent<HTMLUListElement>) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.currentTarget.scrollBy({ left: event.deltaY });
    event.preventDefault();
  };

  // `null` is the pre-hydration state, not an empty list — see the note on
  // `getRecentServerSnapshot`. Rendering the empty message here would show it
  // for a frame to someone who does have a history.
  if (raw === null) return null;

  const showArrows = canScroll.left || canScroll.right;

  return (
    <section className="border-t border-line py-14 sm:py-16">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl leading-snug sm:text-2xl">Recently viewed</h2>
            <p className="mt-2 text-sm text-muted">
              Kept on this device only — nothing is sent to us.
            </p>
          </div>

          {recent.length > 0 && showArrows && (
            <div className="flex items-center gap-3">
              <PageButton
                label="Previous recently viewed"
                disabled={!canScroll.left}
                onClick={() => page(-1)}
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </PageButton>
              <PageButton
                label="More recently viewed"
                disabled={!canScroll.right}
                onClick={() => page(1)}
              >
                <ArrowRightIcon className="h-4 w-4" />
              </PageButton>
            </div>
          )}
        </div>

        {recent.length === 0 ? (
          <p className="mt-8 border-t border-line pt-6 text-body">
            You have not opened any products yet. The ones you look at will
            appear here.
          </p>
        ) : (
          <ul
            ref={trackRef}
            onScroll={sync}
            onWheel={onWheel}
            className="hscroll mt-8 flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-1 py-4"
          >
            {recent.map((product) => (
              <li
                key={product.id}
                data-product-id={product.id}
                /* Wider on a phone than the other tracks' 82%: this card puts
                   a 112px image and a spec column side by side, and at 82% the
                   column was too narrow for a spec to fit on one line at all.
                   The peek of the next card is smaller as a result, which is
                   the trade. */
                className={`w-[92%] flex-none snap-center transition-[transform,box-shadow] duration-300 ease-out sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)] ${
                  activeId === product.id
                    ? "-translate-y-2.5 scale-[1.05] shadow-card-hover"
                    : "hover:-translate-y-2.5 hover:scale-[1.05] hover:shadow-card-hover"
                }`}
              >
                <ProductCard product={product} orientation="horizontal" />
              </li>
            ))}
          </ul>
        )}
      </div>
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
      className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-raised text-ink transition-colors hover:border-ink disabled:cursor-default disabled:border-line disabled:text-muted disabled:opacity-40"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
