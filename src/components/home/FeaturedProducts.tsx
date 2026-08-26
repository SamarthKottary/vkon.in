"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "@/components/icons/ui";
import { ProductCard } from "@/components/product/ProductCard";
import type { Product } from "@/lib/types";

/**
 * "Featured products" — a horizontal, centre-snapping row.
 *
 * **A vertical scroll gesture over this row simply scrolls the page —
 * nothing here intercepts the wheel at all.** This is the standard pattern
 * (Netflix, Amazon and most product-rail carousels use it): a wheel/trackpad
 * scroll always does what it does everywhere else on the page; horizontal
 * movement comes from drag, touch swipe, or a trackpad's native two-finger
 * horizontal swipe — all of which need no JS at all beyond plain
 * `overflow-x: auto`.
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
 * row by itself. Drag, native trackpad-horizontal and the autoplay belt all
 * still can.
 *
 * Same `hscroll` track idiom as `SectorBrowser`/`ProductRow`, with two things
 * those don't need, both asked for together because they serve one effect —
 * the centred card reading as the one currently "picked up":
 *
 *  - **Snap was `center` until 2026-08-26, when it turned out to be the root
 *    cause of a client-reported bug, not just an aesthetic choice.**
 *    Aligning one card's centre to the track's centre is a genuinely
 *    different goal from "show exactly three whole cards" — they only agree
 *    at `scrollLeft: 0` by coincidence. Every other reachable centred
 *    position (confirmed directly: 395px, 805px, 1216px, each one step
 *    apart, `scroll-snap-align: center` doing exactly what it says) has to
 *    put a whole number of cards either side of a *centre point*, and three
 *    cards' combined width doesn't split evenly around one card's centre —
 *    so a sliver of a fourth card shows on one edge every time, which is
 *    what the client saw ("the 3 cards are visible at a time. But on the
 *    leftmost side the previous card[']s edge is visible. I dont want that
 *    edge visible"). This was never a drift bug to correct after the fact —
 *    an early attempt at exactly that (rounding `scrollLeft` to the nearest
 *    step in JS) failed because the browser's own snap machinery re-asserts
 *    its chosen position *synchronously* on any write to `scrollLeft` while
 *    `scroll-snap-type` is active, before the next frame can even read it
 *    back; confirmed directly, setting `scrollLeft` to a clean multiple and
 *    reading it back immediately already showed the old, centred value.
 *    Snapping to `start` instead asks a fundamentally answerable question —
 *    align a card's *left edge*, not its centre — which is what naturally
 *    keeps every rest position a whole multiple of one card's width from the
 *    last, and so always exactly three whole cards, on this and every other
 *    track that already uses `start` (`SectorBrowser`, `ProductRow`). The
 *    "which card is active" pop below does not depend on this either way —
 *    `measure()` computes the centred card itself, directly from card
 *    rects, regardless of what CSS did to get the scroll there.
 *    Strength is `proximity`, not `mandatory` — see the note further down on
 *    why a vertical scroll needs the row *not* to insist on a snap point.
 *  - **Exactly one card is ever popped, and only while this section itself is
 *    in view.** An `IntersectionObserver` on the section root (not the
 *    track) drives the in-view half of that; the un-viewing case (scrolling
 *    the page past the section and away) un-pops whatever was popped.
 *
 *    **On a pointer device, only the cursor decides — nothing is popped by
 *    default** (client, 2026-08-26 — a card used to pop just from sitting
 *    centred in the track, with no hover at all; "lets not make the middle
 *    card pop up automatically... when the cursor is on a card i want that
 *    card to pop up"). `hoveredId` alone drives `poppedId` wherever
 *    `hoverCapable` is true. **On a touch device**, which has no cursor to
 *    read at all, whichever card's own centre sits closest to the track's
 *    centre pops instead — checked by measuring rects on scroll and resize,
 *    the same way `sync` below already measures for `advance`. That fallback
 *    is the one case `centeredId` still drives the pop.
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
 *  - **The row advances on its own, endlessly.** One card every 3s, and the
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
 *    A manual swipe gets the same correction, only later. `advance()`
 *    corrects before it steps, which covers autoplay, but dragging the row
 *    directly never calls `advance()` — nothing was correcting *that* drift
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
 *    **Hovering a card's *footer row* pauses it; hovering anything else does
 *    not** (client, 2026-08-24 — whole-card hover-pause removed; client,
 *    2026-08-26 — reintroduced for the footer row only). The image, the
 *    inter-card gaps and the rest of the page all leave the belt running.
 *    The original removal's trade-off still stands for those: the belt can
 *    shift a card out from under a click mid-interaction, accepted on the
 *    reasoning that the explicit pause button below is the real WCAG 2.2.2
 *    mechanism and hover-pause was only ever a second safety net.
 *
 *    **The footer is the exception because that is where the controls are**,
 *    and their own hover animations were measurably missing while the belt
 *    moved underneath them (15 hover attempts with the belt running: 1 miss;
 *    the same 15 paused: 0). Most of those misses turned out to be the
 *    `inert` bug fixed separately the same day, but not all — a card with
 *    `inert=false` was still observed missing once, so belt motion alone can
 *    do it.
 *
 *    **How it pauses matters more than that it pauses, and this is the third
 *    attempt at it — read this before changing the mechanism.** The first
 *    two folded a hover flag into `running` as React state. That tears the
 *    interval down on hover and builds a fresh one on un-hover, and
 *    `setInterval` does not fire on creation — so every exit cost a full
 *    fresh 3s no matter how much of the cycle had already run, and crossing
 *    a boundary repeatedly reset the countdown indefinitely. That is what
 *    the client reported as the belt taking "a while for it to start moving
 *    again", and what made a footer-wide scope measure as an 8-second freeze
 *    under ordinary cursor movement. The current version keeps the interval
 *    alive permanently and has the callback *skip* itself while
 *    `hoverPausedRef` (a ref — no re-render, no teardown) is true. The
 *    cadence keeps its phase, so leaving a footer resumes within the
 *    remaining ≤3s (~1.5s average) instead of a guaranteed 3s, and no amount
 *    of in-and-out movement can starve it. Any future change here should
 *    preserve that property, not just the scope.
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
  /** Whether the cursor is inside a card's footer row (the "View details" /
   *  add-to-cart strip, marked `data-featured-footer` by
   *  `product/ProductCard`). The autoplay tick reads this and skips itself
   *  while it is true.
   *
   *  **A ref, deliberately, not state — this is the whole point of the
   *  approach.** The obvious version puts this in `running` as state, which
   *  tears the interval down on every hover and builds a fresh one on every
   *  un-hover. `setInterval` does not fire on creation, so that meant a full
   *  3s wait *every* time the cursor left a footer regardless of how much of
   *  the cycle had already elapsed, and repeatedly crossing a boundary reset
   *  the countdown over and over — which is exactly the "takes a while for it
   *  to start moving again" the client reported when this was last tried
   *  (2026-08-26). As a ref, nothing re-renders and the interval is never
   *  rebuilt: the cadence keeps its own phase, a paused tick is *skipped*
   *  rather than deferred, and leaving a footer means the next scheduled tick
   *  arrives on the original schedule (≤3s, ~1.5s on average) instead of a
   *  guaranteed fresh 3s. */
  const hoverPausedRef = useRef(false);
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

  /* A pointer device pops only what the cursor is actually over — no
     fallback to the centred card (client, 2026-08-26: "lets not make the
     middle card pop up automatically... when the cursor is on a card i want
     that card to pop up"). A touch device still falls back to `centeredId`:
     there is no cursor to hover with, so the centred card reading as
     "active" is the only signal a touch visitor gets at all, and removing it
     there would leave nothing ever popped on a phone. */
  const poppedId = inView ? (hoverCapable ? hoveredId : centeredId) : null;

  /* Scroll-settle timer for `correctSeam`, and the animation-frame handle
     for throttling `sync` — both cleared on unmount below. */
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

  /** One card's width plus the gap between cards — the exact distance
   *  `advance` steps by. */
  const measureStep = useCallback((el: HTMLElement) => {
    const first = el.children[0] as HTMLElement | undefined;
    return first ? first.getBoundingClientRect().width + 24 : el.clientWidth;
  }, []);

  /** Finds the card at a screen point by geometry, not by asking the browser
   *  to hit-test.
   *
   *  Written to work around `inert` (2026-08-26 — the doubled row's second
   *  copy carried it, and `elementFromPoint` and a native event's `target`
   *  both skip `inert` content, so the pop highlight silently never fired on
   *  a duplicate card). **`inert` is gone as of later the same day** — see
   *  the note on the `<li>` below, where it turned out to be killing clicks
   *  too — so hit-testing would now work here. This is kept as-is anyway:
   *  it is correct regardless of what any future change does to
   *  `pointer-events`, `inert`, or overlay stacking on these cards, none of
   *  which `getBoundingClientRect()` cares about, and the original bug is a
   *  good argument for not depending on hit-testing in a component that
   *  layers this much on top of its cards. */
  const findCardAt = useCallback((x: number, y: number) => {
    const el = trackRef.current;
    if (!el) return null;
    for (const card of el.querySelectorAll<HTMLElement>("[data-product-id]")) {
      const rect = card.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return card.dataset.productId ?? null;
      }
    }
    return null;
  }, []);

  /** Same point-in-rect approach as `findCardAt`, over
   *  `product/ProductCard`'s `data-featured-footer` marker — whether the
   *  pointer is inside any card's "View details"/add-to-cart row, on a real
   *  or duplicate copy alike. Drives `hoverPausedRef`. */
  const isOverFooter = useCallback((x: number, y: number) => {
    const el = trackRef.current;
    if (!el) return false;
    for (const footer of el.querySelectorAll<HTMLElement>("[data-featured-footer]")) {
      const rect = footer.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return true;
      }
    }
    return false;
  }, []);

  /** The actual DOM read: `canScroll`, `canLoop`, which card is centred, and
   *  which one is under the pointer. Split out from `sync` so `correctSeam`
   *  can call it directly, synchronously, in the same tick as the
   *  `scrollLeft` write that crosses the seam — see the note there for why
   *  that matters.
   *
   *  **Re-resolves `hoveredId` from the last known pointer position on every
   *  call, not only from `onMouseMove`** (client, 2026-08-24 — the belt used
   *  to pause on hover specifically so this gap could never be reached; once
   *  it no longer pauses, a card can slide out from under a *stationary*
   *  cursor and the highlight stayed on it, because a native pointer event
   *  only fires on pointer movement, never on content moving underneath a
   *  still pointer). Since this already re-runs on every scroll frame the
   *  belt produces during autoplay, calling `findCardAt` here keeps the
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
       it: a touch tap fires a stray pointer event too, and there is no
       reason to spend a `findCardAt` call every scroll frame resolving a
       value a touch device's `poppedId` computation is going to ignore. */
    if (hoverCapable && pointerRef.current) {
      setHoveredId(findCardAt(pointerRef.current.x, pointerRef.current.y));
    }
  }, [canLoop, hoverCapable, findCardAt]);

  /** Pulls the scroll position back across the seam if it has drifted past
   *  one set-width. Forward only — a native `scrollLeft` cannot go negative,
   *  and the belt itself only ever moves forward now that the direction
   *  arrows are gone. Shares its measurement with `advance`'s own pre-step
   *  check, so the two never disagree about where the seam actually is.
   *
   *  **Calls `measure()` itself, right after the write, instead of leaving it
   *  to the next scroll-driven `sync`.** That next call would land on the
   *  *following* animation frame — one frame where `centeredId` still names
   *  the old, second-copy card, which the jump has just carried off-screen.
   *  Confirmed on this row: the popped card's outline and shadow vanished for
   *  two to three frames after the jump, then reappeared on the correct card
   *  with its `duration-300` transition restarting from flat — a highlight
   *  that blinks off and grows back, layered on top of an instant
   *  reposition. That combination is almost certainly what read as the
   *  section "glitching" rather than simply jumping.
   *
   *  **What this function does not do, and why not — it looked like the
   *  right fix at first.** A client report ("the 3 cards are visible at a
   *  time. But on the leftmost side the previous card's edge is visible. I
   *  dont want that edge visible") first looked like scroll drift: three
   *  consecutive autoplay ticks from a clean start settled at 395px, 805px,
   *  1216px — a step apart from each other, but the first about 16px short
   *  of a clean multiple of the step. Rounding `scrollLeft` to the nearest
   *  multiple here was the first fix attempted, and it did nothing —
   *  confirmed by logging: the smooth-scroll animation itself was already
   *  settling at 395 *before* this function even ran, and writing a
   *  "corrected" value afterward was silently overwritten back to 395 by the
   *  browser's own snap machinery, confirmed by reading `scrollLeft` back
   *  immediately after the write. The real cause was CSS, not a JS race:
   *  `.hscroll`'s `scroll-padding-left` (set for `SectorBrowser` and
   *  `ProductRow`, whose tracks don't carry this one's `-mx-3`/`px-4`) was
   *  shifting every snap calculation on this track by an amount that never
   *  matched its actual padding, which is why the numbers were consistently
   *  off by a fixed amount rather than randomly drifting. Fixed at the
   *  source — see the `scroll-padding-left` override on the track below —
   *  and confirmed the anomaly is gone there, so no JS correction belongs
   *  here for it. */
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
       touch drag, momentum, native trackpad-horizontal wheel input, or an
       `advance()` call that already corrected itself before this even ran.
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

  /* Takes the duplicate copy's focusable controls out of the tab order,
     without taking them out of the *pointer's* reach the way `inert` did —
     see the note on the `<li>` below for the bug that caused.
     `aria-hidden` there handles the accessibility tree; this handles the tab
     order, and the two together are what `inert` was originally chosen to
     provide in one attribute.

     Done here rather than declaratively because the focusable elements are
     several layers down inside `product/ProductCard` (the title link, the
     "View details" link, the add-to-cart button), and threading a
     "don't be focusable" prop through that component — which is shared with
     the catalogue and every other card on the site — to serve this one
     carousel's duplicate copies would put belt-specific plumbing in a
     component that has nothing to do with the belt.

     Re-runs whenever the duplicated set changes. `slots.length` is the
     dependency that actually matters (it doubles the moment `canLoop` turns
     on), and `canLoop` is listed too so the pass also runs on the way back
     down. */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    for (const card of el.querySelectorAll<HTMLElement>("[data-product-id]")) {
      const isDuplicate = card.getAttribute("aria-hidden") === "true";
      for (const focusable of card.querySelectorAll<HTMLElement>("a, button")) {
        if (isDuplicate) focusable.setAttribute("tabindex", "-1");
        else focusable.removeAttribute("tabindex");
      }
    }
  }, [canLoop, products.length]);

  /** Advances by one card, measured from the DOM so it follows the
   *  breakpoint. Forward only — the direction arrows that once ran this in
   *  reverse are gone (client, 2026-08-26), and autoplay is the only caller
   *  left.
   *
   *  On a belt it first pulls the scroll position back across the seam if it
   *  has drifted past one set-width — instantly, and *before* the smooth step
   *  rather than during it. The two copies are identical at that offset so
   *  the jump cannot be seen, and doing it between animations rather than
   *  inside one avoids cancelling a scroll already in flight. */
  const advance = () => {
    const el = trackRef.current;
    if (!el) return;
    const step = measureStep(el);

    if (canLoop) {
      const oneSet = measureOneSet(el);
      if (el.scrollLeft >= oneSet) el.scrollLeft -= oneSet;
    }

    el.scrollBy({ left: step, behavior: "smooth" });
  };

  /* One card every 3s (client, 2026-08-26, up from 2s), wrapping to the
     start at the end. The wrap is a plain scroll to 0: the alternative —
     rendering the list twice and silently resetting `scrollLeft` by one
     set-width for a seamless belt — collides with the centred-card logic
     above, which keys the pop on `data-product-id`, and a duplicated list
     means two elements answer to the same id.

     `running` folds in every reason to hold the timer *down*: reduced
     motion, an explicit pause, a hidden tab, the section being off-screen,
     and nothing to scroll in the first place. **Footer hover is deliberately
     not one of them** — it skips the tick from inside the callback instead,
     via `hoverPausedRef`; see below, and the note on that ref for why that
     distinction is the entire fix. */
  const canAdvance = canLoop || canScroll.right;
  const running = autoplay && !paused && inView && canAdvance;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      /* Skip, don't reschedule. The interval keeps its own phase while the
         cursor sits on a footer, so leaving one resumes on the original
         cadence rather than restarting a fresh 3s — see `hoverPausedRef`.
         A tick spent hovering is simply lost, which is what "pause" should
         mean here: the belt does not "catch up" afterwards. */
      if (hoverPausedRef.current) return;
      /* No end to test for: `advance` carries the seam, so every tick is the
         same single step whether or not it happens to cross it. */
      advance();
    }, 3000);
    return () => window.clearInterval(id);
  }, [running, canLoop]);

  if (products.length === 0) return null;

  /* The belt: one set for the eye, a second so there is always a card
     following the last. `uid` keeps the two copies distinguishable — the pop
     below keys on it, and React needs it for `key`. */
  const slots = (canLoop ? [...products, ...products] : products).map(
    (product, index) => ({ product, index, uid: `${product.id}#${index}` }),
  );

  return (
    <div ref={rootRef}>
      <div>
        <h2 className="text-xl leading-snug sm:text-2xl">Featured products</h2>
        <p className="mt-2 text-sm text-muted">
          A handful pulled out from the catalogue.
        </p>
      </div>

      {/* Hover is read from one `mousemove` on the track via `findCardAt`'s
          geometric scan, not `event.target`/`elementFromPoint` hit-testing —
          see the note on `findCardAt` for why: hit-testing cannot see the
          doubled row's `inert` second copy at all. `mousemove`, not
          `mouseover`: moving between cards the hit-testing way passes through
          a frame with nothing hovered when the boundary lands on inert
          content, which is exactly the gap that broke the third card. A
          continuous `mousemove` has no such gap; a move over the inter-card
          space keeps the last card found rather than clearing — only leaving
          the whole track clears. */}
      <ul
        ref={trackRef}
        onScroll={onScroll}
        onMouseMove={(event) => {
          pointerRef.current = { x: event.clientX, y: event.clientY };
          /* Only update on an actual find — a move over the inter-card gap
             keeps the last card found rather than clearing, same as the
             hit-testing version this replaced. Only `onMouseLeave` (leaving
             the whole track) clears it. */
          const found = findCardAt(event.clientX, event.clientY);
          if (found) setHoveredId(found);
          /* Gated on `hoverCapable` for the same reason the pop already is:
             a touch tap can fire one stray `mousemove` and never a
             `mouseleave`, which would latch this `true` and stop the belt
             for good on that device. A fine pointer always sends the moves
             that clear it again. */
          hoverPausedRef.current =
            hoverCapable && isOverFooter(event.clientX, event.clientY);
        }}
        onMouseLeave={() => {
          pointerRef.current = null;
          setHoveredId(null);
          hoverPausedRef.current = false;
        }}
        aria-label="Featured products"
        /* `-mx-* px-*`, not a plain wider `px-*` (client, 2026-08-26: the
           rightmost popped card's corner was visibly cut off; then, after a
           first fix, "still the right most cards edges are not visible").
           **The first attempt at this margin sized it for the wrong thing.**
           It reasoned that the popped card's `scale-[1.05]` was growing past
           its own box and needed room to bleed into — plausible, but wrong:
           `scale-[1.05]` and `-translate-y-2.5` are both silently no-ops
           here, confirmed directly (`getComputedStyle(inner).transform`
           reads `"none"` on a popped card, exactly the same Tailwind gap
           already on record elsewhere in this project for these two
           utilities), so nothing was ever scaling and there was never any
           transform bleed to accommodate. The actual bleed is
           `shadow-card-hover`'s own second shadow layer, `0 10px 28px`, a
           28px blur radius that paints outside the box on every side
           whenever a card pops, entirely independent of the (non-functional)
           transform.

           A flat 12px margin, sized for the wrong 5.6px figure, covered less
           than half of a 28px blur — which is why the previous fix did not
           actually fix it. This one matches each breakpoint's own container
           padding exactly (`px-5`/`px-6`/`px-8` on `ui/Container`, size
           `wide`) rather than one fixed number: 20px/24px/32px of margin,
           using all the room actually available at each width without ever
           pushing the track's own box past the viewport edge — confirmed no
           page-level horizontal overflow at a 375px viewport. Only the
           `lg` figure (32px) fully covers the 28px blur; `sm` and below
           still fall a little short, a real, acknowledged trade-off against
           not overflowing a narrow viewport, not an oversight.

           The matching padding is 4px more than each margin at every
           breakpoint, so it nets back to the original `px-1`'s 4px inset
           exactly regardless of breakpoint — confirmed directly, the first
           card's `getBoundingClientRect().x` is unchanged from before either
           of these two margin fixes, at every width tested. Same reasoning
           as the existing `py-4`, which already does this for the vertical
           lift; this is the same fix for the horizontal edges, which `py-4`
           never covered.

           **`[scroll-padding-left:24px]` (28px/36px at `sm`/`lg`) overrides
           `.hscroll`'s own `scroll-padding-left`** (1.25rem/1.5rem/2rem
           across the same breakpoints) — the actual fix for the client's
           other report that day ("the 3 cards are visible at a time. But on
           the leftmost side the previous card's edge is visible"). `.hscroll`
           is shared with `SectorBrowser`/`ProductRow`, whose tracks carry
           neither this one's negative margin nor this much of its own
           padding, and its `scroll-padding-left` was tuned for their
           geometry, not this one's — inherited here anyway, it shifted every
           `scroll-snap-align: start` calculation on this track by an amount
           that never matched what this track actually needed.

           **The value that works is not zero — it's whatever this track's
           own `padding-left` resolves to at that breakpoint, confirmed by
           testing a spread of candidates directly, not derived from the CSS
           Snap spec text.** `scroll-padding` turned out not to be "extra
           inset on top of the element's own padding" but something closer to
           "how much of the element's own padding to actually treat as
           reserved" — leaving it unset (`0`) still produced an offset
           settle, one step short of clean; matching it exactly to this
           track's own `px-6`/`px-7`/`px-9` (24px/28px/36px) is what finally
           produced clean, evenly-spaced rest positions (0px, 411px, 821px at
           `lg` — a consistent step apart from `scrollLeft: 0`) where the
           inherited `.hscroll` value produced 395px/805px/1216px, the exact
           sequence that put a sliver of a fourth card in view. See the note
           above `correctSeam` for the full trail — a JS "round to the
           nearest step" fix was tried first and failed, because the
           browser's own snap machinery silently overwrote it; this
           CSS-level fix, once tuned to the right number, is what actually
           worked. */
        className="hscroll -mx-5 mt-8 flex snap-x snap-proximity items-stretch gap-6 overflow-x-auto px-6 py-4 [scroll-padding-left:24px] sm:-mx-6 sm:px-7 sm:[scroll-padding-left:28px] lg:-mx-8 lg:px-9 lg:[scroll-padding-left:36px]"
      >
        {slots.map(({ product, index, uid }) => (
          <li
            key={uid}
            data-product-id={uid}
            /* The second copy is scenery to assistive technology — a screen
               reader that met every product twice would report a list of
               twelve where the catalogue holds six — but it is *not* scenery
               to the mouse: it is a fully visible card that a visitor can
               and does point at, and roughly half the time it is the card
               under the cursor.

               **This was `inert` until 2026-08-26, and that was a real,
               shipped bug.** `inert` does hide the subtree from both the
               accessibility tree and the tab order, which is what it was
               chosen for (`aria-hidden` alone would have left focusable
               controls in the tab order — the one combination ARIA
               forbids). But `inert` also disables *pointer* interaction
               entirely: on a duplicate card, hover never fired and
               **"Add to cart" and "View details" did nothing at all when
               clicked** — confirmed directly, a real click on a visible
               duplicate's add-to-cart button left `localStorage` completely
               unchanged. That is what the client reported as "after 3 [cards]
               I have to go out of the card then bring it" and "the third
               right most card button doesn't animate": both are the same
               thing, the belt having scrolled a duplicate into view.

               `aria-hidden` + `tabIndex={-1}` on every focusable descendant
               (applied by the effect above — see it for why it cannot be
               done declaratively from here) gets the same two guarantees
               `inert` was chosen for, without the third, unwanted one: the
               subtree stays out of the accessibility tree *and* out of the
               tab order, so the forbidden combination never arises, while
               the mouse keeps working normally. Clicking a duplicate is
               correct and desirable — it is the same product, and its link
               and button carry the same real `href`/handler as the original. */
            aria-hidden={canLoop && index >= products.length}
            className={`relative w-[82%] flex-none snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)] ${
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
                list) because v4's `scale`/`translate` are their own properties.

                **Neither `-translate-y-2.5` nor `scale-[1.05]` actually does
                anything** (confirmed 2026-08-26 — `getComputedStyle(el).transform`
                reads `"none"` on a popped card either way), the same silent
                Tailwind bracket-value gap on record elsewhere in this project.
                Left as-is rather than fixed here: `-translate-y-2.5` was
                already a known, deliberately-unfixed instance as of
                2026-08-24; `scale-[1.05]` is a newly-found one, discovered
                while chasing an unrelated clipping report, not something this
                pass was asked to fix. The `outline` and `shadow-card-hover`
                are what the pop actually looks like today. */}
            <div
              className={`h-full rounded-[2px] transition duration-300 ease-out ${
                poppedId === uid
                  ? "-translate-y-2.5 scale-[1.05] outline outline-2 -outline-offset-2 outline-accent shadow-card-hover"
                  : "outline outline-2 -outline-offset-2 outline-transparent"
              }`}
            >
              <ProductCard product={product} priority={index === 0} orientation="featured" />
            </div>
          </li>
        ))}
      </ul>

      {/* Pause control, centred below the belt (client, 2026-08-26 — it sat
          beside the heading, next to the direction arrows, which are gone).
          WCAG 2.2.2: content that moves on its own for more than five
          seconds needs a way to stop it, and hovering is not one — it does
          nothing for a touch or keyboard visitor. Same control the hero
          carries, for the same reason. Gated on `canAdvance`, not just
          `autoplay`: a row with nothing to scroll never runs regardless of
          `autoplay`, so a pause button for it would have nothing to pause. */}
      {autoplay && canAdvance && (
        <div className="mt-4 flex justify-center">
          <PageButton
            label={`${paused ? "Resume" : "Pause"} the featured products row`}
            disabled={false}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? (
              <PlayIcon className="h-4 w-4" />
            ) : (
              <PauseIcon className="h-4 w-4" />
            )}
          </PageButton>
        </div>
      )}
    </div>
  );
}

/**
 * Now only the pause/play control (client, 2026-08-26 — this used to be
 * shared with the direction arrows, which are gone).
 *
 * **Sized up 20% and given real presence** (client: "make the pause button
 * bit more better looking and bigger by 20%") — `h-9 w-9` (36px) → 43px, the
 * icon 14px → 16px alongside it. `shadow-card`, which it did not carry
 * before, plus a background shift and a gentle scale on hover
 * (`hover:bg-surface-subtle`, `hover:shadow-card-hover`,
 * `hover:[transform:scale(1.08)]`) give it the same weight the rest of the
 * site's raised, bordered controls already have, rather than the flat
 * outline it was.
 *
 * `[transform:scale(1.08)]`, not `scale-108`/`hover:scale-108` — there is no
 * such step on Tailwind's default scale, and an arbitrary *named* step
 * (`scale-[1.08]`) is the exact form already found silently failing under a
 * stacked variant elsewhere in this file's history (`ui/Button`,
 * `product/ProductCard`) — the arbitrary-*property* form sidesteps that
 * regardless of variant stacking, so it is used here by default rather than
 * re-risking the same gap.
 */
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
      className="flex h-[43px] w-[43px] items-center justify-center rounded-full border border-line bg-surface-raised text-ink shadow-card transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out hover:border-ink hover:bg-surface-subtle hover:shadow-card-hover hover:[transform:scale(1.08)] disabled:cursor-default disabled:text-muted disabled:opacity-40 disabled:shadow-none disabled:hover:[transform:scale(1)]"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
