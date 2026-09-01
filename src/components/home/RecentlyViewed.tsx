"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
 * takes vertical padding rather than `overflow-visible`, and why this
 * measures rects directly instead of using `IntersectionObserver` for the
 * centred-card check itself.
 *
 * **Snap is `proximity` from `sm` up, and there is no `onWheel` handler**
 * (client, 2026-08-24 — this row had both, converting any vertical wheel
 * delta into a horizontal scroll of the row and blocking the page underneath
 * it, the same bug `home/FeaturedProducts` had and was fixed the same way).
 * `mandatory` snap on its own was *also* enough to make scrolling the page
 * over this row unreliable at those widths — real wheel/trackpad input is
 * rarely perfectly vertical, and mandatory snap grabs a gesture that carries
 * even a few pixels of incidental horizontal noise rather than letting it
 * chain to the page. `proximity` only pulls in a scroll that was already
 * going to land near a snap point on its own.
 *
 * **Below `sm` it is `mandatory`, with a settle-timer on top** (client,
 * 2026-09-01: "lets implement the same swipe mechanism for recent viewed
 * cards in mobile view. Just the swipe feature and the card should be the
 * centre") — the identical pairing `home/FeaturedProducts`' own row just
 * got, for the identical reason: a touch swipe carries none of the
 * incidental-wheel-noise risk `proximity` exists to avoid, so `mandatory`
 * is safe there even though it is not here. `correctCardStep` forces the
 * settled rest position to the nearest exact card-step multiple, since
 * `mandatory` alone is not perfectly reliable from every gesture shape
 * either — see that component's own note on `correctCardStep` for the full
 * reasoning, unchanged here beyond this row having no seam/loop to also
 * correct. This row has no autoplay to reset a timer on and no Quick View
 * to fade, so neither of those two `FeaturedProducts` mechanisms apply —
 * out of scope here, not overlooked.
 *
 * **Centring is measured from the real rendered card, not a CSS
 * percentage** (`measureHalfPeek`, applied as an inline
 * `scroll-padding-left` below `sm`) — the same fix, for the same reason,
 * as `FeaturedProducts`' own centring: a percentage on `scroll-padding-left`
 * resolves against the track's bare `clientWidth`, while this card's own
 * width resolves against the track's *content box* (`clientWidth` minus
 * its `px-6` padding), so a flat `4%` was never exactly half the true peek
 * to begin with — confirmed wrong there via direct measurement before this
 * row ever got the same treatment, not re-derived by hitting the same bug
 * twice.
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

  /** One card's width plus the gap between cards — the exact distance a
   *  swipe or a page button steps by. Matches `page`'s own inline
   *  calculation below exactly; both read the same `16px` gap. */
  const measureStep = useCallback((el: HTMLElement) => {
    const first = el.children[0] as HTMLElement | undefined;
    return first ? first.getBoundingClientRect().width + 16 : el.clientWidth;
  }, []);

  /** Half the leftover space either side of a card once centred — see the
   *  component's own note on why this is measured from the real rendered
   *  card rather than assumed as a fixed CSS percentage. */
  const measureHalfPeek = useCallback((el: HTMLElement) => {
    const first = el.children[0] as HTMLElement | undefined;
    if (!first) return 0;
    return (el.clientWidth - first.getBoundingClientRect().width) / 2;
  }, []);

  /** Applies `measureHalfPeek`'s value as the track's own
   *  `scroll-padding-left`, mobile only — see `FeaturedProducts`' own
   *  identical effect for the full reasoning (an inline style, not a CSS
   *  class, since the value is only knowable after layout; cleared at `sm`
   *  and up so the existing `sm:`/`lg:` CSS values take back over). No
   *  ordering constraint against a mount-time jump the way that
   *  component's version has — this row has no equivalent to reset — so a
   *  plain `useEffect` would be safe here too, but `useLayoutEffect` costs
   *  nothing extra and keeps the two components' identical mechanisms
   *  identical in shape as well as behaviour.
   *
   *  **`recent.length` is in the dependency array for a reason specific to
   *  this component, not copied blindly from `FeaturedProducts`'** —
   *  confirmed missing the hard way: without it, every card measured a
   *  flat, unhalved `20px` peek (`.hscroll`'s own base
   *  `scroll-padding-left`, not this effect's value) no matter how the
   *  track resized. This row returns `null` — no `<ul>`, `trackRef.current`
   *  still empty — until `raw` resolves from `localStorage` (see the
   *  component's own note), so this effect's *first* run is always a
   *  same-render no-op on a `null` ref. `measureHalfPeek` never changes
   *  reference, so with only that in the array React saw an unchanged
   *  dependency list on the next render and skipped re-running the effect
   *  entirely — never mind that the ref had since been attached to a real
   *  element. `sync`'s own `ResizeObserver` effect further down already
   *  depends on `recent.length` for what turns out to be the identical
   *  reason; this one needed the same fix, not a different one. */
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const applyPeek = () => {
      if (window.innerWidth >= 640) {
        el.style.scrollPaddingLeft = "";
        return;
      }
      el.style.scrollPaddingLeft = `${measureHalfPeek(el)}px`;
    };
    applyPeek();
    const observer = new ResizeObserver(applyPeek);
    observer.observe(el);
    window.addEventListener("resize", applyPeek);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applyPeek);
    };
  }, [measureHalfPeek, recent.length]);

  /** Forces the settled rest position to the nearest exact card-step
   *  multiple, mobile only — see `FeaturedProducts`' own `correctCardStep`
   *  for the general reasoning (`snap-mandatory` alone is not perfectly
   *  reliable from every gesture shape; `scrollTo`, not a raw `scrollLeft`
   *  write, is what actually reads back correctly under active
   *  `scroll-snap`). No seam or loop on this row to also correct, unlike
   *  that component's version — this is the whole of what settling needs
   *  to do here.
   *
   *  **The target is the nearest card's own `offsetLeft`, not
   *  `index * step`** — confirmed directly this track's own `px-6` leading
   *  padding makes a difference here that it apparently does not visibly
   *  break for `FeaturedProducts`' formula-based version: a real drag
   *  settled natively at `317px` (correct — native `snap-mandatory`
   *  already resolves `card.offsetLeft - scrollPaddingLeft` on its own),
   *  but the `index * step - halfPeek` formula computed `292.9375px`
   *  for the same card, silently missing that this track's first card
   *  does not start at `0` — it starts `24px` in, at the track's own
   *  padding. Forcing a `scrollTo` toward that wrong target fought the
   *  browser's own already-correct native resolution rather than
   *  reinforcing it, which is a worse source of visible "lag" than no
   *  correction at all would have been. Reading each card's real
   *  `offsetLeft` directly, the same way `sync`'s own nearest-card scan
   *  already does, is correct regardless of leading padding, non-uniform
   *  gaps, or anything else a formula would have to know about in
   *  advance. */
  const correctCardStep = useCallback(
    (el: HTMLElement) => {
      if (window.innerWidth >= 640) return;
      const halfPeek = measureHalfPeek(el);
      const trackMid = el.getBoundingClientRect().left + el.clientWidth / 2;
      let bestOffsetLeft: number | null = null;
      let bestDistance = Infinity;
      for (const card of el.querySelectorAll<HTMLElement>("[data-product-id]")) {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - trackMid);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestOffsetLeft = card.offsetLeft;
        }
      }
      if (bestOffsetLeft === null) return;
      const target = bestOffsetLeft - halfPeek;
      if (Math.abs(el.scrollLeft - target) > 1) {
        el.scrollTo({ left: target, behavior: "smooth" });
      }
    },
    [measureHalfPeek],
  );

  const settleTimer = useRef<number | null>(null);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({
      left: el.scrollLeft > 4,
      right: el.scrollLeft < max - 4,
    });

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

    /* Armed on every scroll, cleared and re-armed by the next one, so it
       only ever fires once scrolling has actually stopped — the same
       "never correct mid-gesture" rule every other settle-timer on this
       site already follows. */
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const trackEl = trackRef.current;
      if (trackEl) correctCardStep(trackEl);
    }, 120);
  }, [correctCardStep]);

  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    [],
  );

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
    el.scrollBy({ left: measureStep(el) * direction, behavior: "smooth" });
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

          {/* `lg:hidden` (client, 2026-08-27: "lets bring the left and right
              toggle in desktop mode to the centre below the recent viewed
              product cards") — this copy of the controls now covers only
              below `lg`; a second copy, centred beneath the card list, takes
              over at `lg` and up. Deliberately breaks the "matched pair"
              this row and `SectorBrowser` were built to keep (see the note
              on `home/page.tsx` where they're rendered) — that symmetry was
              never itself the ask, and this one's explicit instruction
              points the two layouts in different directions on desktop now.
              Two copies of the same controls rather than one repositioned
              with CSS: `display: none` removes a copy from the tab order
              and the accessibility tree together, so whichever breakpoint
              is active is the only one a keyboard or screen-reader visitor
              ever reaches — there is no risk of landing on an invisible,
              off-screen button either way. */}
          {recent.length > 0 && showArrows && (
            <div className="flex items-center gap-3 lg:hidden">
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
            onMouseOver={(event) => {
              const card = (event.target as HTMLElement).closest<HTMLElement>(
                "[data-product-id]",
              );
              if (card) setHoveredId(card.dataset.productId ?? null);
            }}
            onMouseLeave={() => setHoveredId(null)}
            /* `mx-[calc(50%-50vw)]`, not the implicit inset it used to sit
               at inside this section's own `max-w-7xl` container (client,
               2026-08-27: "for recent viewed, the products should start
               and end at the literal page ending not at fixed position" —
               same report and same fix as `home/FeaturedProducts`, see
               that component's own note on this exact class for why the
               formula works at any viewport width including one widened
               past the container's cap by zooming out). `px-6 sm:px-7
               lg:px-9`, not the previous bare `px-1`: with the container's
               own padding no longer providing any inset now that this
               breaks out of it, this reproduces that lost inset directly
               — and matches `FeaturedProducts`' own track padding exactly,
               which was tuned specifically to clear a popped card's
               `shadow-card-hover` bleed, a concern this track shares
               (same pop treatment, same shadow) but had never carried
               padding generous enough to actually cover.

                **Always `justify-start`** (client, 2026-08-29: "is should
                add from left side, not from center"). Unlike FeaturedProducts,
                which centres its content when everything fits, recently viewed
                cards should always start and align from the left edge of the
                page even if there is only a single card. */
            className={`hscroll mt-8 flex snap-x snap-mandatory sm:snap-proximity items-stretch gap-4 overflow-x-auto py-10 sm:[scroll-padding-left:1.5rem] lg:[scroll-padding-left:2rem] ${
              recent.length > 2
                ? `mx-[calc(50%-50vw)] px-6 sm:px-7 lg:px-9 ${
                    showArrows ? "justify-start" : "justify-center"
                  }`
                : "justify-start"
            }`}
          >
            {recent.map((product) => (
              <li
                key={product.id}
                data-product-id={product.id}
                /* Wider on a phone than the other tracks' 82%: this card puts
                   a 112px image and a spec column side by side, and at 82% the
                   column was too narrow for a spec to fit on one line at all.
                   The peek of the next card is smaller as a result, which is
                   the trade.

                   `lg:w-[392px]`, not `lg:w-[calc((100%-2rem)/3)]` (client,
                   follow-up: "do not stretch instead just fit and centre")
                   — same fix as `FeaturedProducts`' own card width, and for
                   the same reason: a percentage of the track's own width
                   keeps growing as the track does, which is what "stretch"
                   meant once the track above went full-bleed. 392px is not
                   a guess — it is what the old formula already rendered at
                   exactly 1280px, this page's own width ceiling before
                   today, so nothing changes at or under that width. */
                className={`relative w-[92%] flex-none snap-start sm:w-[calc((100%-1rem)/2)] lg:w-[392px] ${
                  poppedId === product.id ? "z-10" : "z-0"
                }`}
              >
                {/* See `FeaturedProducts`: the pop transform lives on this inner
                    layer, not the hover-target `<li>`, so lifting/scaling never
                    pulls the card out from under the pointer and loops. */}
                <div className="h-full">
                  <ProductCard product={product} orientation="horizontal" isPopped={poppedId === product.id} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* The `lg`-and-up half of the pair above — centred below the card
            list instead of beside the heading. Same `showArrows` gate, so
            it only ever appears alongside the row it controls. */}
        {showArrows && (
          <div className="mt-6 hidden items-center justify-center gap-3 lg:flex">
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
