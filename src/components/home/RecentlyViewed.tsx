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
 * **Exactly one card is popped at a time, and only while this section itself
 * is in view** — scrolling the page to reach the section pops the centred
 * card, scrolling past it un-pops it, same idiom as `home/FeaturedProducts`:
 * whichever card's own centre sits closest to the track's centre is popped
 * while an `IntersectionObserver` on the section finds it in the viewport,
 * checked on scroll and resize, and pointing at a different card overrides it
 * rather than adding to it. See that component's comment for why the track
 * takes vertical padding rather than `overflow-visible`, why a plain wheel
 * needs its own handler, and why this measures rects directly instead of
 * using `IntersectionObserver` for the centred-card check itself.
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

  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  const [centeredId, setCenteredId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /* Whether the section itself is in the viewport — see the comment on the
     component for why this, and not an interaction flag, gates the pop. */
  const [inView, setInView] = useState(false);
  /* See `home/FeaturedProducts` for why a real mouse hover only counts on a
     device that genuinely has one — a touch tap's stray `mouseenter` would
     otherwise stick the border on whatever card was first touched. */
  const [hoverCapable, setHoverCapable] = useState(false);

  useEffect(() => {
    setHoverCapable(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // `raw` starts `null` (pre-hydration — see the note below), and this
    // component returns `null` in that state without rendering `<section>`
    // at all, so `sectionRef.current` is still empty on this effect's first
    // run. Re-running once `raw` resolves is what lets it actually attach,
    // rather than bailing out here permanently on an empty dependency array.
  }, [raw]);

  const poppedId = inView ? (hoverCapable ? hoveredId ?? centeredId : centeredId) : null;

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({
      left: el.scrollLeft > 4,
      right: el.scrollLeft < max - 4,
    });

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
  }, [sync, recent.length]);

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
    <section ref={sectionRef} className="border-t border-line py-14 sm:py-16">
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
                onMouseEnter={() => setHoveredId(product.id)}
                onMouseLeave={() => setHoveredId(null)}
                /* Wider on a phone than the other tracks' 82%: this card puts
                   a 112px image and a spec column side by side, and at 82% the
                   column was too narrow for a spec to fit on one line at all.
                   The peek of the next card is smaller as a result, which is
                   the trade. */
                className={`relative w-[92%] flex-none snap-center sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)] ${
                  poppedId === product.id ? "z-10" : "z-0"
                }`}
              >
                {/* See `FeaturedProducts`: the pop transform lives on this inner
                    layer, not the hover-target `<li>`, so lifting/scaling never
                    pulls the card out from under the pointer and loops. */}
                <div
                  className={`h-full rounded-[2px] transition duration-300 ease-out ${
                    poppedId === product.id
                      ? "-translate-y-2.5 scale-[1.05] outline outline-2 -outline-offset-2 outline-accent shadow-card-hover"
                      : "outline outline-2 -outline-offset-2 outline-transparent"
                  }`}
                >
                  <ProductCard product={product} orientation="horizontal" />
                </div>
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
