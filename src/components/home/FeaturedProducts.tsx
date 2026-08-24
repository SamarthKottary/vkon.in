"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, PauseIcon, PlayIcon } from "@/components/icons/ui";
import { ProductCard } from "@/components/product/ProductCard";
import type { Product } from "@/lib/types";

/**
 * "Featured products" — a horizontal, centre-snapping row.
 *
 * **A vertical scroll gesture over this row simply scrolls the page —
 * nothing here intercepts the wheel at all.** This is the standard pattern
 * (Netflix, Amazon and most product-rail carousels use it): a wheel/trackpad
 * scroll always does what it does everywhere else on the page; horizontal
 * movement comes from drag, touch swipe, a trackpad's native two-finger
 * horizontal swipe, or the arrow buttons below — all of which need no JS at
 * all beyond plain `overflow-x: auto`.
 *
 * It took three earlier attempts to arrive back at "do nothing," each
 * recorded because the failure of one is why the next existed:
 *
 * 1. An `onWheel` handler converted any vertical wheel delta into a
 *    horizontal `scrollBy` and called `preventDefault()` unconditionally.
 *    Scrolling down with the cursor on a card didn't scroll the page at all
 *    — it flung the row sideways by whatever the wheel's delta happened to
 *    be. This is the "moving wildly" behaviour.
 * 2. Removing that handler and leaving the wheel alone, but with the row
 *    still carrying `scroll-snap-type: x mandatory`. A perfectly vertical
 *    synthetic scroll chained to the page fine, but real trackpad input is
 *    rarely perfectly axis-aligned, and *mandatory* snap grabbed any gesture
 *    that carried even a few incidental pixels of horizontal noise —
 *    confirmed by reproducing it directly: a deltaY-dominant scroll with 3px
 *    of deltaX moved neither the row nor the page. Not wild, just unreliable.
 * 3. A native (non-passive — React's `onWheel` prop cannot call
 *    `preventDefault()` at all, confirmed separately) listener that blocked
 *    any vertical-dominant wheel event outright, trading page-scroll-while-
 *    hovering away entirely for reliability. It worked, confirmed on real
 *    hardware, but a dead zone that swallows the wheel is a pattern people
 *    notice (embedded maps are the usual offender), and it was only needed
 *    because of attempt 2's `mandatory` snap.
 *
 * The fix underneath attempts 2 and 3 was never the JS — it was
 * `mandatory`. `proximity` only snaps when a scroll ends *already* near a
 * snap point; it does not grab a gesture just because it has a horizontal
 * component, so a vertical scroll chains to the page the way attempt 2
 * needed it to, without attempt 3's dead zone. The trade-off going back to
 * "do nothing": a plain vertical mouse wheel can no longer page through the
 * row by itself. The arrows, drag, native trackpad-horizontal and the
 * autoplay belt all still can.
 *
 * Same `hscroll` track idiom as `SectorBrowser`/`ProductRow`, with two things
 * those don't need, both asked for together because they serve one effect —
 * the centred card reading as the one currently "picked up":
 *
 *  - **Snap is `center`, not `start`.** The other tracks line a card up
 *    against the left edge; this one settles it in the middle, which is
 *    also the frame the "which card is active" check below reads from.
 *    Strength is `proximity`, not `mandatory` — see the note further down on
 *    why a vertical scroll needs the row *not* to insist on a snap point.
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
 *  - **The row advances on its own, endlessly.** One card every 2s, and the
 *    first card follows the last with no rewind — the list is rendered twice
 *    and the scroll position is silently pulled back by one set-width each
 *    time it crosses the seam. Both copies hold identical content at that
 *    offset, so the jump is invisible; what a visitor sees is a belt.
 *
 *    That set-width is measured from the DOM (`measureOneSet`), not taken as
 *    `scrollWidth / 2`. The two look equivalent and are not: a doubled row of
 *    `2N` cards has `2N-1` gaps between them, so halving `scrollWidth` splits
 *    one gap's width unevenly across the two copies instead of counting it
 *    once on each side — on this row it was off by 8.5px. An "invisible"
 *    reset landing 8.5px short of the real seam is not invisible, and every
 *    wrap jolted the row by that amount — worse the longer autoplay ran,
 *    because each cycle re-measured the same wrong split independently rather
 *    than compounding, but a jolt on every single lap reads as constant
 *    stutter, not an occasional one. Reading the DOM offset between card 0
 *    and its duplicate is exact regardless of gaps, padding or borders,
 *    because it never has to know about any of them.
 *
 *    A manual swipe gets the same correction, only later. `page()` corrects
 *    before it steps, which covers autoplay and the arrows, but dragging the
 *    row directly never calls `page()` — nothing was correcting *that* drift
 *    at all, so a swipe past the seam either ran out of track at the end of
 *    the second copy or waited for the next autoplay tick to yank it back by
 *    a then-wrong amount. `onScroll` now arms a short settle timer on every
 *    scroll event and corrects once it fires — once scrolling has actually
 *    stopped, never mid-gesture, which would fight a touch drag in progress.
 *    Both paths share `measureOneSet`, so a correction is pixel-exact and
 *    invisible regardless of who triggered it. `onScroll` is also throttled
 *    to one measurement per animation frame, since native `scroll` fires far
 *    more often than the display updates and the centred-card scan below is
 *    not free.
 *
 *    Duplication is why every card carries a `uid` (`<product id>#<slot>`)
 *    rather than its bare product id: two elements now answer to the same
 *    product, and the centred-card pop below keys on the element. Without it
 *    both copies popped at once.
 *
 *    The belt only forms when one set genuinely overflows the track. Doubling
 *    a row that already fits would invent scrolling that is not wanted, so
 *    `canLoop` measures one set against the visible width — and measures it
 *    as `scrollWidth / 2` once doubled, which keeps the answer stable instead
 *    of flip-flopping as the DOM changes under it.
 *    It is gated the same way the hero's rotation is (see `HeroRotator`):
 *    off until an effect confirms `prefers-reduced-motion` is not set, frozen
 *    while the tab is hidden, and stopped whenever the section is out of view
 *    so a phone is not animating a row nobody is looking at.
 *
 *    **Hover and keyboard focus do not pause it** (client, 2026-08-24 — they
 *    used to). The trade-off was raised before removing it: the belt can now
 *    shift a card out from under a click mid-interaction, including an
 *    "Add to cart" press landing on whatever card the belt happened to
 *    scroll into that spot rather than the one the visitor was looking at.
 *    Accepted anyway, on the reasoning that the explicit pause button below
 *    is the real WCAG 2.2.2 mechanism and always was; hover/focus pausing was
 *    a second safety net on top of it, not the thing satisfying the
 *    requirement. Losing the net is a real, accepted risk, not a non-issue.
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
  /* Last known pointer position while it is over the row, in viewport
     coordinates — `null` when it is not. Not React state: it does not need
     to trigger a render on its own, only to be read back inside `measure`.
     See the note there for what this is for. */
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  /* Whether the section itself is in the viewport — see the comment on the
     component for why this, and not an interaction flag, gates the pop. */
  const [inView, setInView] = useState(false);
  /* A touch tap can fire a stray `mouseover` that would stick `hoveredId` on
     whatever card was first touched and hide the border from the card the
     swipe later centres. Trusting hover only where a fine pointer genuinely
     exists keeps every touch device on the centred card. */
  const [hoverCapable, setHoverCapable] = useState(false);
  /* Autoplay stays off until an effect confirms motion is welcome, so a
     reduced-motion visitor never sees one unrequested step — matching how
     `HeroRotator` gates its rotation. */
  const [autoplay, setAutoplay] = useState(false);
  const [paused, setPaused] = useState(false);
  /* Whether one set of cards overflows the track, and so whether the belt is
     rendered at all. See the note on the component. */
  const [canLoop, setCanLoop] = useState(false);

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

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAutoplay(!motion.matches);
    sync();
    motion.addEventListener("change", sync);
    return () => motion.removeEventListener("change", sync);
  }, []);

  /* A background tab still fires timers, so without this the row scrolls on
     unseen and the visitor returns to it part-way through a card. */
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const poppedId = inView ? (hoverCapable ? hoveredId ?? centeredId : centeredId) : null;

  /* Scroll-settle timer for `correctSeam`, and the animation-frame handle for
     throttling `sync` — both cleared on unmount below. */
  const settleTimer = useRef<number | null>(null);
  const syncFrame = useRef<number | null>(null);

  /** The exact pixel offset between a card and its duplicate — see the note
   *  on the component for why this is not `scrollWidth / 2`. Reads
   *  `el.children` directly: both call sites are `canLoop`-gated, so by the
   *  time this runs the row is already doubled and the child at
   *  `products.length` *is* card 0 of the second copy. */
  const measureOneSet = useCallback(
    (el: HTMLElement) => {
      const first = el.children[0] as HTMLElement | undefined;
      const second = el.children[products.length] as HTMLElement | undefined;
      return first && second
        ? second.offsetLeft - first.offsetLeft
        : el.scrollWidth / 2;
    },
    [products.length],
  );

  /** The actual DOM read: `canScroll`, `canLoop`, which card is centred, and
   *  which one is under the pointer. Split out from `sync` so `correctSeam`
   *  can call it directly, synchronously, in the same tick as the
   *  `scrollLeft` write that crosses the seam — see the note there for why
   *  that matters.
   *
   *  **Re-resolves `hoveredId` from the last known pointer position on every
   *  call, not only from `onMouseOver`** (client, 2026-08-24 — the belt used
   *  to pause on hover specifically so this gap could never be reached; once
   *  it no longer pauses, a card can slide out from under a *stationary*
   *  cursor and the highlight stayed on it, because `mouseover` only fires on
   *  pointer movement, never on content moving underneath a still pointer).
   *  Since this already re-runs on every scroll frame the belt produces
   *  during autoplay, checking `document.elementFromPoint` here keeps the
   *  highlight on whatever is actually under the cursor for the entire
   *  animation, not only at its start and end. */
  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });

    /* One set's width, whether or not it is currently doubled — so enabling
       the belt cannot change the measurement that decided to enable it. A
       coarse `scrollWidth / 2` is fine here: this only decides whether to
       double the row, not where the seam sits, so the few pixels it can be
       off by never matter for this check. */
    const oneSet = canLoop ? el.scrollWidth / 2 : el.scrollWidth;
    setCanLoop(oneSet > el.clientWidth + 8);

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

    /* Gated on `hoverCapable` for the same reason `poppedId` already reads
       it: a touch tap fires a stray `mouseover` too, and there is no reason
       to spend an `elementFromPoint` call every scroll frame resolving a
       value a touch device's `poppedId` computation is going to ignore. */
    if (hoverCapable && pointerRef.current) {
      const under = document
        .elementFromPoint(pointerRef.current.x, pointerRef.current.y)
        ?.closest<HTMLElement>("[data-product-id]");
      setHoveredId(under?.dataset.productId ?? null);
    }
  }, [canLoop, hoverCapable]);

  /** Pulls the scroll position back across the seam if it has drifted past
   *  one set-width. Forward only — a native `scrollLeft` cannot go negative,
   *  so there is no backward case to correct here even though `page(-1)`
   *  exists; that direction corrects itself inline, before it steps. Shares
   *  its measurement with that pre-step check, so the two never disagree
   *  about where the seam actually is.
   *
   *  **Calls `measure()` itself, right after the write, instead of leaving it
   *  to the next scroll-driven `sync`.** That next call would land on the
   *  *following* animation frame — one frame where `centeredId` still names
   *  the old, second-copy card, which the jump has just carried off-screen.
   *  Confirmed on this row: the popped card's outline and shadow vanished for
   *  two to three frames after the jump, then reappeared on the correct card
   *  with its `duration-300` transition restarting from flat — a highlight
   *  that blinks off and grows back, layered on top of an instant 1600px
   *  reposition. That combination is almost certainly what read as the
   *  section "glitching" rather than simply jumping. */
  const correctSeam = useCallback(() => {
    const el = trackRef.current;
    if (!el || !canLoop) return;
    const oneSet = measureOneSet(el);
    if (el.scrollLeft < oneSet) return;
    el.scrollLeft -= oneSet;
    measure();
  }, [canLoop, measureOneSet, measure]);

  /* Throttled to one run per animation frame — see the note on the
     component. Native `scroll` fires far more often than the display
     updates, and this does a full per-card scan on every one of them. */
  const sync = useCallback(() => {
    measure();

    /* Armed on every scroll, cleared and re-armed by the next one, so it only
       ever fires once scrolling has actually stopped — whatever caused it:
       touch drag, momentum, native trackpad-horizontal wheel input, or a
       `page()` call that already corrected itself before this even ran.
       Correcting mid-gesture would mean fighting a touch drag still in
       progress. */
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(correctSeam, 120);
  }, [measure, correctSeam]);

  const onScroll = useCallback(() => {
    if (syncFrame.current !== null) return;
    syncFrame.current = window.requestAnimationFrame(() => {
      syncFrame.current = null;
      sync();
    });
  }, [sync]);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync, products.length]);

  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      if (syncFrame.current !== null) window.cancelAnimationFrame(syncFrame.current);
    },
    [],
  );

  /** Pages by one card, measured from the DOM so it follows the breakpoint.
   *
   *  On a belt it first pulls the scroll position back across the seam if it
   *  has drifted past one set-width — instantly, and *before* the smooth step
   *  rather than during it. The two copies are identical at that offset so the
   *  jump cannot be seen, and doing it between animations rather than inside
   *  one avoids cancelling a scroll already in flight. Paging backwards from
   *  the start does the mirror, which is what lets the arrows run the belt in
   *  reverse instead of stopping dead at zero. */
  const page = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 24 : el.clientWidth;

    if (canLoop) {
      const oneSet = measureOneSet(el);
      if (direction === 1 && el.scrollLeft >= oneSet) el.scrollLeft -= oneSet;
      else if (direction === -1 && el.scrollLeft < step) el.scrollLeft += oneSet;
    }

    el.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  /* One card every 4s, wrapping to the start at the end.
     
     `page(1)` is reused rather than duplicated so the auto step and the arrow
     step are the same distance by construction. The wrap is a plain scroll to
     0: the alternative — rendering the list twice and silently resetting
     `scrollLeft` by one set-width for a seamless belt — collides with the
     centred-card logic above, which keys the pop on `data-product-id`, and a
     duplicated list means two elements answer to the same id.
     
     `running` folds in every reason to hold still: reduced motion, an
     explicit pause, a hidden tab, the section being off-screen, and nothing
     to scroll in the first place. Hover and focus are deliberately not in
     this list — see the note on the component. */
  const running =
    autoplay && !paused && inView && (canLoop || canScroll.right);

  useEffect(() => {
    if (!running) return;
    /* No end to test for: `page` carries the seam, so every tick is the same
       single step whether or not it happens to cross it. */
    const id = window.setInterval(() => page(1), 2000);
    return () => window.clearInterval(id);
  }, [running, canLoop]);

  if (products.length === 0) return null;

  /* On a belt neither end is ever reached, so nothing is ever disabled. */
  const showArrows = canLoop || canScroll.left || canScroll.right;
  const arrowsEnabled = canLoop
    ? { left: true, right: true }
    : canScroll;

  /* The belt: one set for the eye, a second so there is always a card
     following the last. `uid` keeps the two copies distinguishable — the pop
     below keys on it, and React needs it for `key`. */
  const slots = (canLoop ? [...products, ...products] : products).map(
    (product, index) => ({ product, index, uid: `${product.id}#${index}` }),
  );

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
            {/* WCAG 2.2.2: content that moves on its own for more than five
                seconds needs a way to stop it, and hovering is not one — it
                does nothing for a touch or keyboard visitor. Same control the
                hero carries, for the same reason. */}
            {autoplay && (
              <PageButton
                label={`${paused ? "Resume" : "Pause"} the featured products row`}
                disabled={false}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? (
                  <PlayIcon className="h-3.5 w-3.5" />
                ) : (
                  <PauseIcon className="h-3.5 w-3.5" />
                )}
              </PageButton>
            )}
            <PageButton
              label="Previous featured product"
              disabled={!arrowsEnabled.left}
              onClick={() => page(-1)}
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </PageButton>
            <PageButton
              label="More featured products"
              disabled={!arrowsEnabled.right}
              onClick={() => page(1)}
            >
              <ArrowRightIcon className="h-4 w-4" />
            </PageButton>
          </div>
        )}
      </div>

      {/* Hover is read from one `mouseover` on the track, not per-card
          `mouseenter`/`mouseleave`: moving between cards that way passes
          through a frame with nothing hovered, and the pop flicked back to
          the centred card for that frame. `mouseover` resolves the card under
          the pointer directly with no gap, and a move over the inter-card gap
          keeps the last card rather than clearing — only leaving the whole
          track clears. */}
      <ul
        ref={trackRef}
        onScroll={onScroll}
        onMouseOver={(event) => {
          pointerRef.current = { x: event.clientX, y: event.clientY };
          const card = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-product-id]",
          );
          if (card) setHoveredId(card.dataset.productId ?? null);
        }}
        onMouseLeave={() => {
          pointerRef.current = null;
          setHoveredId(null);
        }}
        aria-label="Featured products"
        className="hscroll mt-8 flex snap-x snap-proximity items-stretch gap-6 overflow-x-auto px-1 py-4"
      >
        {slots.map(({ product, index, uid }) => (
          <li
            key={uid}
            data-product-id={uid}
            /* The second copy is scenery, not content: a screen reader that
               met every product twice would report a list of twelve where the
               catalogue holds six.
               
               `inert`, not `aria-hidden` alone. Each card holds focusable
               things — its title link, and now an add-to-cart button — and
               `aria-hidden` hides them from assistive technology while leaving
               them in the tab order, which is the one combination ARIA
               forbids: a keyboard lands on a control a screen reader has just
               been told does not exist. `inert` takes the subtree out of both,
               and implies the hidden semantics, so it replaces rather than
               joins the old attribute. */
            inert={canLoop && index >= products.length}
            className={`relative w-[82%] flex-none snap-center sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)] ${
              poppedId === uid ? "z-10" : "z-0"
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
                poppedId === uid
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
