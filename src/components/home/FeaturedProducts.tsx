"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from "@/components/icons/ui";
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
 *    Strength is `proximity`, not `mandatory`, from `sm` up — see the note
 *    further down on why a vertical scroll needs the row *not* to insist on
 *    a snap point there. **Below `sm` it is `mandatory`, with a settle-timer
 *    on top** (client, 2026-09-01: "one swipe and the next card to come...
 *    It should not swipe like this and both cards are visible unless i
 *    fully swipe across") — a touch swipe carries none of that wheel-noise
 *    risk, the same reasoning `product/ProductMedia`'s own gallery already
 *    relies on for the identical pairing; see `correctCardStep`.
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
  /* Bumped on every mobile scroll-settle so the autoplay interval effect
     below re-arms — see the note on `sync`'s settle-timer for why. */
  const [swipeResetSignal, setSwipeResetSignal] = useState(0);
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
  const modalPausedRef = useRef(false);
  /* Set the instant a mobile touch starts on the track, cleared once that
     gesture's own settle is confirmed (or, failing that, on a fallback
     timer) — see the note on the autoplay interval effect below for why a
     ref set *immediately*, not the settle-triggered `swipeResetSignal`
     alone, is what actually closes the race that let autoplay double-fire
     right after a swipe near its own 3s mark. */
  const swipePausedRef = useRef(false);
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
  /** Which dot is lit, below. One per product, not one per page of visible
   *  cards — same convention as `about/AboutGallery`'s dots, which this
   *  control row was explicitly modelled on (client, 2026-08-27). Computed
   *  the same way that component computes its own `index`: rounded scroll
   *  position divided by one step, modulo the product count so a position
   *  past the seam (in the duplicate set) still lights a real dot rather than
   *  running off the end of the array. */
  const [stepIndex, setStepIndex] = useState(0);

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
        : el.scrollWidth / 3;
    },
    [products.length],
  );

  /** One card's width plus the gap between cards — the exact distance
   *  `advance` steps by. */
  const measureStep = useCallback((el: HTMLElement) => {
    const first = el.children[0] as HTMLElement | undefined;
    return first ? first.getBoundingClientRect().width + 24 : el.clientWidth;
  }, []);

  /** Half the leftover space either side of a card once centred — the
   *  mobile-only peek amount, measured from the real rendered card width
   *  rather than derived from its own `82%` Tailwind class.
   *
   *  **Not `clientWidth * 0.09`, and not a CSS percentage on
   *  `scroll-padding-left` either — both were tried and both were wrong**
   *  (client, 2026-09-01, immediately after the `snap-mandatory` pass
   *  below shipped: "the cards are not centered after the first card").
   *  `w-[82%]` on the card resolves against the *track's own content box*
   *  — `clientWidth` minus this track's `px-6`/`24px` padding either side
   *  — not the bare `clientWidth` a percentage on `scroll-padding-left`
   *  resolves against. The two are close enough at small paddings to look
   *  right by eye but are not equal, and the gap between them (confirmed
   *  directly: a measured `35px` left peek against a `74px` right one,
   *  where symmetric would be `~55px` each) is exactly what read as
   *  "not centred." Measuring the actual rendered card width side-steps
   *  needing to know the padding/percentage relationship at all — this is
   *  correct for whatever the card's width happens to compute to, not only
   *  today's `82%`/`px-6` pairing. */
  const measureHalfPeek = useCallback((el: HTMLElement) => {
    const first = el.children[0] as HTMLElement | undefined;
    if (!first) return 0;
    return (el.clientWidth - first.getBoundingClientRect().width) / 2;
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
   *  `product/ProductCard`'s `data-featured-footer` and `data-featured-quickview`
   *  markers — whether the pointer is inside any card's "View details"/
   *  add-to-cart row *or* its Quick view button, on a real or duplicate copy
   *  alike. Drives `hoverPausedRef`.
   *
   *  Quick view joined the footer here rather than getting its own ref
   *  (client, 2026-09-01: "when i point the mouse on the quick view its
   *  should not scroll to right automatically... when it not pointing to
   *  quick view then its can autoscroll") — `modalPausedRef` already covers
   *  the button *after* it's clicked and the modal is open; this covers the
   *  hover *before* that click, which needed the same "skip this tick"
   *  treatment the footer row already had, not a new mechanism. */
  const isOverFooter = useCallback((x: number, y: number) => {
    const el = trackRef.current;
    if (!el) return false;
    for (const zone of el.querySelectorAll<HTMLElement>(
      "[data-featured-footer], [data-featured-quickview]",
    )) {
      const rect = zone.getBoundingClientRect();
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

    /* One set's width, whether or not it is currently tripled — so enabling
       the belt cannot change the measurement that decided to enable it. A
       coarse `scrollWidth / 3` is fine here: this only decides whether to
       enable the loop, not where the seam sits, so the few pixels it can be
       off by never matter for this check. */
    const oneSet = canLoop ? el.scrollWidth / 3 : el.scrollWidth;
    setCanLoop(oneSet > el.clientWidth + 8);

    const trackMid = el.getBoundingClientRect().left + el.clientWidth / 2;
    const step = measureStep(el);
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

    /* Which dot is lit — see the note on `stepIndex`. `products.length` is
       guaranteed non-zero here: the component returns `null` before this
       track (and therefore this callback) ever renders otherwise. */
    setStepIndex(Math.round(el.scrollLeft / step) % products.length);
  }, [canLoop, hoverCapable, findCardAt, measureStep, products.length]);

  /** Continuous Quick View fade, touch only — a per-card `closeness` (`1`
   *  exactly centred, a flat plateau for the inner 40% of a step either
   *  side, ramping to `0` a full step away) written straight to a
   *  `--pop-progress` custom property on each card's own Quick View
   *  wrapper (client, 2026-09-01, across three messages on this row's
   *  Quick View: "should come from 0% to 100% visiblity when the card
   *  comes to the centre... fade away when the next card comes to the
   *  centre"; "When the card is 40% at the centre the fading animation
   *  quick view should appear... 40% away... smoothly go away"; and,
   *  after both landed and were confirmed on a real phone still not
   *  smooth: "i will let you handle the fade but i should be able to look
   *  and feel that it is fading away appearing").
   *
   *  **Not called from `measure()` any more — see `dragLoop` below for why
   *  and what replaced it.** The shape of `closeness` itself is unchanged
   *  from the previous two passes; only *when* it gets evaluated moved.
   *
   *  **Also finds and sets `centeredId` itself now, on every frame this
   *  runs — a second, independent instance of `measure()`'s own identical
   *  "nearest card" scan, not a replacement for it** (client, follow-up:
   *  "the centre card pop up is not smooth it feels like there 2 pop
   *  ups"). `centeredId` drives the whole card's own pop — border, scale,
   *  lift, shadow, all through one `transition-all duration-300` on the
   *  `<article>` — and until now it only ever updated from `measure()`,
   *  which like `--pop-progress` before this file's previous entry only
   *  runs from `onScroll`. The exact same gap applies here: real mobile
   *  hardware does not fire `scroll` on every frame of a drag, so
   *  `centeredId` could sit stale for a stretch of a gesture and then jump
   *  straight to the new card, restarting that card's `duration-300`
   *  transition from a cold, un-transitioning start rather than a value
   *  that had been continuously tracking the swipe — which reads exactly
   *  like a second, separate pop firing right after the first, not one
   *  continuous handoff. `measure()` keeps computing and setting it too
   *  (unchanged, still needed for the very first render and anything that
   *  is not an active gesture — a resize, the section entering view) —
   *  `setCenteredId` bails out of re-rendering on an unchanged value
   *  either way, so having two callers agree on the same value costs
   *  nothing beyond the scan itself, already proven cheap enough at 60fps
   *  for `--pop-progress`.
   *
   *  **Also factors in vertical screen position now, not only horizontal
   *  centring within the row** (client, 2026-09-01: "show quick view in
   *  featured product when card in horizontal center to the screen in
   *  mobile view, just like in product in product page, but here we
   *  considering both vertical and horizontal center" — referring to
   *  `product/ProductCard`'s own vertical-orientation reveal, which fades
   *  Quick View in purely from how centred a card sits in the *vertical*
   *  scroll of `/products`' grid). Before this, a card sitting dead centre
   *  of the row horizontally showed Quick View at full opacity even with
   *  the whole section barely peeking onto the bottom of the screen —
   *  the horizontal `closeness` below never looked at where the row
   *  actually sat vertically at all. `verticalCloseness` is computed once
   *  per call rather than per card: every card shares one horizontal row,
   *  so they all sit at (functionally) the same vertical screen position
   *  regardless of which one is centred. **A plain linear ramp, not the
   *  horizontal factor's plateau-then-ramp shape** (client, same day:
   *  "keep fade effect between center to +-20% fades 0 to 100%") — 100%
   *  right at the viewport's vertical centre, straight down to 0% at ±20%
   *  of the viewport's own height away from it; see `updatePopProgress`
   *  itself for the exact shape. The two factors multiply, not `Math.min`,
   *  so a card that is dead centre on one axis but only partway centred on
   *  the other still fades smoothly rather than snapping to whichever axis
   *  is worse. */
  const updatePopProgress = useCallback(
    (el: HTMLElement) => {
      const trackRect = el.getBoundingClientRect();
      const trackMid = trackRect.left + el.clientWidth / 2;
      const step = measureStep(el);
      const PLATEAU = 0.4;
      const threshold = PLATEAU * step;

      /* Plain linear ramp, no plateau — 100% right at the viewport's
         vertical centre, straight down to 0% at ±30% of the viewport's
         own height away from it (client, 2026-09-01: "keep fade effect
         between center to +-20% fades 0 to 100%", then "changes to
         +-30%"). The horizontal factor above keeps its own plateau
         (`PLATEAU`/`threshold`); only this axis was asked to change. */
      const viewportMidY = window.innerHeight / 2;
      const rowMidY = trackRect.top + trackRect.height / 2;
      const vDistance = Math.abs(rowMidY - viewportMidY);
      const vMax = window.innerHeight * 0.3;
      const verticalCloseness = Math.max(0, 1 - vDistance / vMax);

      let bestId: string | null = null;
      let bestDistance = Infinity;
      for (const card of el.querySelectorAll<HTMLElement>("[data-product-id]")) {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - trackMid);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = card.dataset.productId ?? null;
        }
        const horizontalCloseness =
          distance <= threshold
            ? 1
            : Math.max(0, 1 - (distance - threshold) / (step - threshold));
        const closeness = horizontalCloseness * verticalCloseness;
        card
          .querySelector<HTMLElement>("[data-quickview-wrapper]")
          ?.style.setProperty("--pop-progress", closeness.toString());
      }
      setCenteredId(bestId);
    },
    [measureStep],
  );

  const dragFrame = useRef<number | null>(null);
  const popProgressStopTimer = useRef<number | null>(null);

  /** **Why this exists at all: `measure()` only runs from `onScroll`, and a
   *  native `scroll` event is not guaranteed to fire on every frame a
   *  touch drag actually moves through.** The previous two passes both
   *  drove `--pop-progress` from inside `measure()`, reasoning that it
   *  already ran on every scroll frame this belt produces — true on a
   *  desktop browser and true in this sandbox's own synthetic touch
   *  testing, and confirmed smooth there both times. Confirmed *not*
   *  smooth on a real phone regardless (client: "not smooth enough" —
   *  after the plateau fix specifically, which had already ruled out the
   *  first pass's own most likely cause). Mobile Safari and Chrome are
   *  both documented to coalesce or throttle `scroll` dispatch during an
   *  active touch gesture rather than firing once per compositor frame
   *  the way a desktop wheel/trackpad scroll does — this component's own
   *  `scrollend`-listener note elsewhere already has "mobile momentum can
   *  keep `scrollLeft` moving for longer than 120ms between individual
   *  `scroll` events" on record, the identical mechanism, previously only
   *  relevant to the seam settle-timer's own timing and now understood to
   *  also explain a visually stepped fade.
   *
   *  The fix is not another CSS knob: it is not depending on `scroll`
   *  dispatch frequency at all. `requestAnimationFrame` runs once per
   *  compositor frame regardless of how the browser paces `scroll`, so a
   *  loop driven by it re-reads the live `scrollLeft` and recomputes every
   *  card's `closeness` up to 60 times a second for as long as it runs —
   *  genuinely continuous, not merely frequent.
   *
   *  **Split into a shared `runPopProgressLoop`/`schedulePopProgressStop`
   *  pair, not kept private to the touch-listener effect** (client,
   *  follow-up: "the quick view button only appears when i swipe... i
   *  want autoplay to also show quick view button with fading animation")
   *  — the first version only ever started this loop from `touchstart`,
   *  so autoplay's own `advance()` (and a tap on an arrow or dot) moved
   *  the row without ever touching `--pop-progress` at all, leaving Quick
   *  View invisible through anything that was not a drag. `advance`,
   *  `retreat` and `goTo` below now call the same two functions a touch
   *  does — same loop, same stop-timer, one mechanism reacting to the row
   *  actually moving regardless of what moved it, rather than a second
   *  one bolted on for autoplay specifically. */
  const runPopProgressLoop = useCallback(() => {
    if (hoverCapable) return;
    if (dragFrame.current !== null) return;
    const loop = () => {
      const el = trackRef.current;
      if (el) updatePopProgress(el);
      dragFrame.current = window.requestAnimationFrame(loop);
    };
    dragFrame.current = window.requestAnimationFrame(loop);
  }, [hoverCapable, updatePopProgress]);

  /** Clears any previously scheduled stop and arms a new one `delayMs` out
   *  — called every time something moves the row, so the loop's own
   *  lifetime always extends to cover whatever just triggered it, whether
   *  that is one touch gesture or one autoplay tick. */
  const schedulePopProgressStop = useCallback((delayMs: number) => {
    if (popProgressStopTimer.current !== null) window.clearTimeout(popProgressStopTimer.current);
    popProgressStopTimer.current = window.setTimeout(() => {
      popProgressStopTimer.current = null;
      if (dragFrame.current !== null) {
        window.cancelAnimationFrame(dragFrame.current);
        dragFrame.current = null;
      }
    }, delayMs);
  }, []);

  /** Touch-specific wiring on top of the shared pair above: starts the loop
   *  immediately on `touchstart` (clearing any stop already scheduled, so
   *  a second touch before the first one's buffer expired does not let it
   *  stop mid-gesture) and defers stopping until half a second after
   *  release — not immediately, because releasing a finger does not mean
   *  the row stops moving: native momentum and `correctCardStep`'s own
   *  settle-timer (armed 120ms after the last `scroll` event, then
   *  animating a `scrollTo` of its own) both keep `scrollLeft` changing
   *  well past `touchend`, and the fade needs to keep tracking through
   *  that final glide into place, not freeze the instant a finger lifts.
   *  `500`ms comfortably covers the 120ms delay plus a
   *  `scrollTo({behavior:"smooth"})` animation's own duration with margin
   *  to spare. Also where `swipePausedRef` is set — see the autoplay
   *  interval effect's own note for why an *instant* flag, not only the
   *  settle-triggered reset, is what actually stops autoplay racing a
   *  swipe near its own 3s mark. */
  useEffect(() => {
    const el = trackRef.current;
    if (!el || hoverCapable) return;

    const start = () => {
      swipePausedRef.current = true;
      if (popProgressStopTimer.current !== null) {
        window.clearTimeout(popProgressStopTimer.current);
        popProgressStopTimer.current = null;
      }
      runPopProgressLoop();
    };

    const end = () => {
      schedulePopProgressStop(500);
      /* Fallback clear, not the primary one — see the note on the
         autoplay interval effect. Covers a touch that never produced a
         `scroll` event at all (a tap, or a drag too small to move
         anything), where `sync`'s own settle-timer — the fast, correct
         path — never arms and `swipeResetSignal` never bumps, which
         would otherwise leave this stuck `true` and autoplay paused
         forever after one touch. */
      window.setTimeout(() => {
        swipePausedRef.current = false;
      }, 500);
    };

    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });

    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [hoverCapable, runPopProgressLoop, schedulePopProgressStop]);

  useEffect(
    () => () => {
      if (popProgressStopTimer.current !== null) window.clearTimeout(popProgressStopTimer.current);
      if (dragFrame.current !== null) window.cancelAnimationFrame(dragFrame.current);
    },
    [],
  );

  /* Keeps `--pop-progress` live across a plain *page* scroll, not only a
     touch/drag on the row itself — `updatePopProgress`'s own vertical
     factor (see its note) only means anything if something recomputes it
     as the row's position in the viewport changes, and page scrolling
     never touches the row's own touch listeners or the drag/autoplay loop
     above. Window-level, not the track's own `onScroll` (that only fires
     for the row's *horizontal* scroll, never for the page scrolling the
     whole section up or down). Throttled to one call per animation frame,
     same idiom as `onScroll`'s own `syncFrame`. Touch-only, matching every
     other `--pop-progress` reader/writer in this file — a hover-capable
     device's Quick View never looks at this property at all. */
  useEffect(() => {
    if (hoverCapable) return;
    const el = trackRef.current;
    if (!el) return;
    let frame: number | null = null;
    const onWindowScroll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updatePopProgress(el);
      });
    };
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onWindowScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [hoverCapable, updatePopProgress]);

  /** Pulls the scroll position back into a safe middle zone whenever it has
   *  settled within 4px of either true edge of the doubled row — **both
   *  directions now**, not forward only (client, 2026-08-27: "when the
   *  first featured product card is there i cant scroll left. When i
   *  scroll left it should show the last product, this is also in desktop
   *  view as well").
   *
   *  **Forward-only used to be correct, because home was `scrollLeft: 0`
   *  and the doubled content only ever existed ahead of it.** That is no
   *  longer true: the row now opens at `oneSet` (see the mount effect
   *  below), with a full duplicate copy sitting *behind* that position too
   *  — copy 1 in `[0, oneSet)`, copy 2 in `[oneSet, 2×oneSet)`, pixel-
   *  identical to each other at a `oneSet` offset either way. A manual
   *  swipe/drag backward from the opening view now has somewhere to go —
   *  straight into copy 1's own tail, which *is* the last product — where
   *  none existed when home was the literal start of the only copy handed
   *  to a visitor.
   *
   *  Correcting near *both* edges rather than at a fixed `oneSet` threshold
   *  is deliberate: with two symmetric copies there is no single "correct"
   *  side to treat as home, only two true edges (`0` and `scrollWidth -
   *  clientWidth`) that must never be where a visitor gets stuck. Whichever
   *  edge is reached, the jump lands on that edge's twin at the opposite
   *  end of the other copy — same content, invisible either way, exactly
   *  as proven already for the forward case alone.
   *
   *  **Still settle-only, never mid-gesture — the reason a fixed-delay
   *  timer was chosen over correcting on every `scroll` event in the first
   *  place** ("Correcting mid-gesture would mean fighting a touch drag in
   *  progress"). Firing only once scrolling has actually stopped is what
   *  keeps this safe to make bidirectional at all: there is no risk of
   *  fighting live momentum in *either* direction, only ever adjusting a
   *  position that has already come to rest.
   *
   *  **Calls `measure()` itself, right after any write, instead of leaving
   *  it to the next scroll-driven `sync`.** That next call would land on
   *  the *following* animation frame — one frame where `centeredId` still
   *  names the old card, which the jump has just carried off-screen.
   *  Confirmed on this row: the popped card's outline and shadow vanished
   *  for two to three frames after the jump, then reappeared on the
   *  correct card with its `duration-300` transition restarting from flat
   *  — a highlight that blinks off and grows back, layered on top of an
   *  instant reposition. That combination is almost certainly what read as
   *  the section "glitching" — and, since `advance`/`retreat`/`goTo` below
   *  now call this same function for their own pre-step correction instead
   *  of each repeating a shorter, `measure()`-less version of it, all four
   *  paths get that fix at once rather than needing it re-applied
   *  individually (client, same message: "sometimes it behaves that way
   *  when using buttons as well" — the button paths had exactly this gap,
   *  independently of the swipe-direction one above).
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
   *  here for it.
   *
   *  Returns whether it actually corrected anything, so a caller (`advance`
   *  et al.) that only cares about *acting* on a fresh position can skip a
   *  redundant re-read when nothing moved.
   *
   *  **The safety margin is `40`, not the original `4`** (client, 2026-08-31,
   *  mobile centred-card pass below) — `4` was tuned for a track with no
   *  `scroll-padding-left` (or a few px of it) to speak of, where a written
   *  `scrollLeft` lands within a pixel or two of intended. Mobile's new
   *  `scroll-padding-left: 9%` (peek-centring, see the track's own note)
   *  makes the browser's snap machinery reassert a raw write with far more
   *  slack than that — confirmed directly: the mount effect below writes
   *  `oneSet` (`2436`) and the browser reasserts it to `2424`, a 12px
   *  shortfall. Landing on the wrong side of a 4px margin turned that alone
   *  into a spurious wrap, immediately after mount, with no gesture at all —
   *  `correctSeam`'s own settle-timer, armed by the `scroll` event the write
   *  itself fires, treated "12px short of `oneSet`" as "close enough to the
   *  true edge to need wrapping." `40` comfortably covers that noise with
   *  room to spare, while staying tiny next to `oneSet` itself (hundreds of
   *  pixels at minimum), so it cannot misread the genuine middle of the row
   *  as an edge either. */
  const correctSeam = useCallback(() => {
    const el = trackRef.current;
    if (!el || !canLoop) return false;
    const oneSet = measureOneSet(el);
    if (el.scrollLeft < oneSet - 40) {
      el.scrollLeft += oneSet;
      measure();
      return true;
    }
    if (el.scrollLeft >= 2 * oneSet - 40) {
      el.scrollLeft -= oneSet;
      measure();
      return true;
    }
    return false;
  }, [canLoop, measureOneSet, measure]);

  /* Forces the settled rest position to the nearest exact card-step
     multiple, mobile only — the same `snap-mandatory` + settle-timer shape
     `product/ProductMedia`'s own image gallery already uses, for the same
     complaint (client, 2026-09-01: "It should not swipe like this and both
     cards are visible unless i fully swipe across" — a screenshot showing
     two cards half-visible mid-scroll). `snap-proximity` alone can leave a
     soft swipe resting wherever momentum happened to stop rather than on a
     card boundary; the fix is not switching this row to `mandatory`
     everywhere (that reintroduces the exact wheel-capture bug documented
     above, real trackpad/mouse input on desktop), only below `sm`, where a
     touch swipe has no such incidental-wheel-noise risk — see the track's
     own `snap-mandatory sm:snap-proximity`. `window.innerWidth < 640`
     matches Tailwind's own `sm` boundary directly, since this runs outside
     any CSS media query. Uses `scrollTo`, not a raw `scrollLeft` write —
     `correctSeam` above needs the raw form specifically to jump a full
     `oneSet` instantly and invisibly, but an animated `scrollTo` here reads
     back reliably afterward the way raw writes under active `scroll-snap`
     do not (see that function's own note on the 12px mount-time
     discrepancy `scrollLeft = x` produced) — the same reason
     `ProductMedia`'s settle-timer already uses `scrollTo` rather than a
     property write.

     **Must subtract the peek amount, not just round to a multiple of
     `step`** — a real `snap-start` rest position for card `i` is
     `i * step - halfPeek`, not `i * step`, once the track carries a
     nonzero `scroll-padding-left` for the peek-centring effect below (set
     to `measureHalfPeek`'s own value — see its note for why that is not
     simply `clientWidth * 0.09`). Card 0 happens to look right either way
     (`0 * step` and `0 * step - halfPeek` both clamp to `0`, there being
     nothing to peek before it), which is exactly why an earlier version of
     this fix that used the wrong half-peek value only showed as broken
     "after the first card." */
  const correctCardStep = useCallback(
    (el: HTMLElement) => {
      if (window.innerWidth >= 640) return;
      const step = measureStep(el);
      const halfPeek = measureHalfPeek(el);
      const nearest = Math.round((el.scrollLeft + halfPeek) / step);
      const target = nearest * step - halfPeek;
      if (Math.abs(el.scrollLeft - target) > 1) {
        el.scrollTo({ left: target, behavior: "smooth" });
      }
    },
    [measureStep, measureHalfPeek],
  );

  /* Applies `measureHalfPeek`'s own value as the track's
     `scroll-padding-left`, mobile only — an inline style rather than a CSS
     percentage, since `measureHalfPeek` is measured from the real rendered
     card, not derivable as a fixed percentage in CSS in the first place
     (see its own note). Cleared (`""`) at `sm` and up so the CSS
     `sm:[scroll-padding-left:28px] lg:[scroll-padding-left:36px]` rules —
     untouched by any of this — take back over normally; an inline style
     always wins over a class regardless of source order, so leaving one
     behind at a wider breakpoint would silently override those. Its own
     `ResizeObserver`, not folded into `sync`'s: this sets a style property,
     `sync` only ever reads the DOM, and keeping a DOM-mutating effect
     separate from the measure-only one is the same separation of concerns
     every other effect in this file already keeps.

     **`useLayoutEffect`, not `useEffect`, and declared before the "opens
     at `oneSet`" layout effect below — both load-bearing.** React runs
     every `useLayoutEffect` before the browser paints and before any
     passive `useEffect` fires, but that guarantee does not extend to a
     passive effect racing a layout effect: a plain `useEffect` here would
     apply this padding *after* that mount-time jump already read whatever
     `scroll-padding-left` was in effect (the `.hscroll` default, not this
     value), landing the opening position wrong until the next resize
     happened to correct it. Declared first, purely for the ordering: React
     runs same-type effects in declaration order, and `oneSet`'s own jump
     needs this value already applied when it reads the DOM. */
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
  }, [measureHalfPeek]);

  /* Throttled to one run per animation frame — see the note on the
     component. Native `scroll` fires far more often than the display
     updates, and this does a full per-card scan on every one of them. */
  const sync = useCallback(() => {
    measure();

    /* Re-arms the pop-progress stop timer on every real scroll frame, not
       only once from `touchend`/`advance` et al. (client, 2026-09-01:
       "quick view is not visible in mobile view while scrolling, when it
       is in center" — confirmed the race: `end()` below and
       `advance`/`retreat`/`goTo` each schedule one fixed-delay stop,
       500ms/700ms, sized to outlast the 120ms settle delay plus a typical
       `scrollTo({behavior:"smooth"})`. `correctCardStep`'s own corrective
       scrollTo, fired *from inside* the settle timer below, is a second
       animation on top of that first one whenever a swipe/tick settles
       short of an exact card step — comfortably long enough, on a real
       phone, to outlast whatever was left of the original buffer. The
       `requestAnimationFrame` loop those timers guard then dies mid-nudge,
       freezing `--pop-progress` at whatever partial value the card had
       reached *before* `correctCardStep` finished centring it — read as
       "sometimes not visible" because it depends on how close the settle
       already was. Guarded on `dragFrame.current`, so this only extends a
       loop already running (from a touch or a button/autoplay tick) rather
       than starting one of its own on, say, a plain resize-driven
       `measure()` call. */
    if (!hoverCapable && dragFrame.current !== null) {
      schedulePopProgressStop(500);
    }

    /* Armed on every scroll, cleared and re-armed by the next one, so it only
       ever fires once scrolling has actually stopped — whatever caused it:
       touch drag, momentum, native trackpad-horizontal wheel input, or an
       `advance()` call that already corrected itself before this even ran.
       Correcting mid-gesture would mean fighting a touch drag still in
       progress. */
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      correctSeam();
      const el = trackRef.current;
      if (!el) return;
      correctCardStep(el);
      /* "After swipe the timer should be reset" (client) — bumps a signal
         the autoplay interval effect below depends on, so it tears down
         and recreates the interval, starting a fresh 3s window from
         whenever a gesture last settled rather than continuing whatever
         was left of the old one. Mobile-only, matching everything else in
         this pass — desktop's arrow/dot clicks were not asked to do this
         and keep the interval running on its existing phase, exactly as
         `running`'s own docblock argues for hover. Fires on every settle,
         autoplay's own ticks included — harmless there, since each tick
         already produces its own settle a moment later, so the interval
         keeps re-arming itself every ~3.1s regardless.

         **`swipePausedRef` clears here too, unconditionally, not only
         inside that `< 640` branch** (client, follow-up: "the timer when
         it is close to 3 seconds dosent reset when i swipe then. After i
         swipe near the 3 second limit it fires and swipes the next card")
         — this is the fix for that report, and it is not the same bug as
         "the interval never resets": the interval *was* resetting, but
         only once this settle-timer fires, 120ms plus a scroll-settle
         animation after the swipe itself — a real gap, easily 300ms or
         more, during which the *old* interval's own already-scheduled tick
         is still live. A swipe landing inside that gap let the old tick
         fire anyway, autoplay stepping the row a second time right on top
         of the visitor's own swipe. `swipePausedRef` closes the gap from
         the other end: set `true` the instant a touch starts (see the
         touch-listener effect above), it makes the interval's own tick
         skip itself — same mechanism `hoverPausedRef` already uses for a
         footer hover — for the *entire* window from touch-start through
         this settle, not only after the new interval exists. Cleared here
         unconditionally (not gated on the same `< 640` check the signal
         bump is) so a stray settle on a wide touch viewport can never
         leave it stuck. */
      swipePausedRef.current = false;
      if (window.innerWidth < 640) setSwipeResetSignal((n) => n + 1);
    }, 120);
  }, [measure, correctSeam, correctCardStep, hoverCapable, schedulePopProgressStop]);

  const onScroll = useCallback(() => {
    if (syncFrame.current !== null) return;
    syncFrame.current = window.requestAnimationFrame(() => {
      syncFrame.current = null;
      sync();
    });
  }, [sync]);

  /* Seeds `--pop-progress` for whichever card starts centred, on mount and
     on every resize — without this, that property is only ever written
     from inside `updatePopProgress`'s own `requestAnimationFrame` loop,
     which nothing starts until the first touch, swipe, arrow/dot click or
     autoplay tick (client, 2026-09-01: "when i reloaded i cant see quick
     view which ever the card centered first after reload" — a fresh page
     load has had none of those yet, so the CSS `var(--pop-progress,0)`
     fallback was rendering that first card's Quick View at a flat `0`
     until whatever interaction happened to come first). `updatePopProgress`
     itself already re-finds `centeredId` on every call the same way
     `measure()` does, so this costs one extra per-card scan on mount and
     on resize, nothing ongoing.

     **Gated on `!hoverCapable`, same as `runPopProgressLoop` itself** —
     missing that gate on a first pass at this same fix caused a follow-up
     regression (client: "in desktop view quick view only visible when
     mouse pointed to it only"): `--pop-progress` is a touch-only mechanism
     everywhere else in this file, and a pointer device's Quick View is
     meant to run on `group-hover` alone, with the property left unset so
     `var(--pop-progress,0)` falls back to its CSS default. Calling
     `updatePopProgress` unconditionally wrote a real, non-zero value onto
     a pointer device's cards too, fighting `group-hover` intermittently.
     The `ResizeObserver` itself still attaches and still calls `sync()`
     unconditionally — that measurement (`canScroll`, the dots,
     `centeredId`) was never touch-only and is not part of either fix. */
  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    if (!hoverCapable) updatePopProgress(el);
    const observer = new ResizeObserver(() => {
      sync();
      if (!hoverCapable) updatePopProgress(el);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync, products.length, updatePopProgress, hoverCapable]);

  /* Opens the belt at `oneSet`, not `0`, once looping is possible — the
     other half of the bidirectional fix on `correctSeam` above: home has
     to start with a full duplicate copy already sitting *behind* it, or a
     backward swipe from the very first view still has nowhere to go, the
     exact bug being fixed (client: "when the first featured product card
     is there i cant scroll left. When i scroll left it should show the
     last product"). `useLayoutEffect`, not `useEffect`, so the jump lands
     before the browser paints the first frame at `0` — a visitor never
     sees the belt open anywhere but on the first card; only the
     underlying `scrollLeft` differs from what it used to be. Re-runs
     whenever `canLoop` flips on — including after a resize crosses back
     into loopable — each time reopening on the first card, which reads as
     reasonable rather than picking up wherever a previous width happened
     to leave it. */
  useLayoutEffect(() => {
    if (!canLoop) return;
    const el = trackRef.current;
    if (!el) return;
    el.scrollLeft = measureOneSet(el);
  }, [canLoop, measureOneSet]);

  /* `scrollend` fires exactly when scrolling — including native momentum —
     has genuinely finished, which the 120ms settle timer in `sync` above
     only approximates. Momentum on some mobile browsers can keep
     `scrollLeft` moving for longer than 120ms between individual `scroll`
     events, and firing the timer's correction mid-momentum means fighting
     a scroll animation still actually in flight — read by the client as
     the belt "moving by itself" (client, mobile specifically: "When i
     keep scrolling right the featured product cards moves by itself when
     i reach the last card"). Feature-detected and purely additive: where
     `scrollend` is supported this corrects immediately and reliably, and
     the existing timer still also fires afterward and finds nothing left
     to do (`correctSeam` is a no-op once already safely mid-row); where it
     is not supported, only the timer runs, exactly as before. */
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !("onscrollend" in el)) return;
    const onScrollEnd = () => {
      if (settleTimer.current !== null) {
        window.clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
      correctSeam();
    };
    el.addEventListener("scrollend", onScrollEnd);
    return () => el.removeEventListener("scrollend", onScrollEnd);
  }, [correctSeam]);

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
   *  breakpoint. Direction arrows were removed 2026-08-26 ("the direction
   *  arrows that once ran this in reverse are gone") and reinstated
   *  2026-08-27 as part of the belt's new paging row — this is autoplay's
   *  own tick and the `>` arrow's handler both, now.
   *
   *  Calls the shared `correctSeam` first — instantly, and *before* the
   *  smooth step rather than during it — rather than repeating its own
   *  one-directional version of the same check (that used to be the case,
   *  and independently lacked the `measure()` call `correctSeam` itself
   *  always made, which is the "sometimes it behaves that way when using
   *  buttons as well" gap fixed by consolidating onto one implementation;
   *  see the note on `correctSeam`). The two copies are identical at a
   *  `oneSet` offset either way, so the jump — in whichever direction it
   *  turns out to fire — cannot be seen, and doing it between animations
   *  rather than inside one avoids cancelling a scroll already in flight. */
  /** `runPopProgressLoop()` + `schedulePopProgressStop(700)` — the same
   *  pair the touch listener calls, so autoplay's own tick (and an arrow
   *  or dot tap) drives Quick View's fade exactly the way a swipe already
   *  does, rather than moving the row with nothing watching it (client:
   *  "i want autoplay to also show quick view button with fading
   *  animation"). `700`ms, not touch's `500`, because there is no gesture
   *  in progress keeping the loop alive the way an unreleased finger does
   *  — this is one `scrollBy`/`scrollTo` animation and nothing else, so
   *  the buffer only needs to outlast that single smooth-scroll's own
   *  duration, with the same kind of margin touch's figure already
   *  carries. No-ops on a hover-capable device, same as the loop itself. */
  const advance = () => {
    const el = trackRef.current;
    if (!el) return;
    runPopProgressLoop();
    schedulePopProgressStop(700);
    correctSeam();
    const step = measureStep(el);
    el.scrollBy({ left: step, behavior: "smooth" });
  };

  /** The `<` arrow's handler — steps back by one card. Mirrors `advance`
   *  exactly, in the opposite direction, sharing the same `correctSeam`
   *  call: a native `scrollLeft` cannot go negative, so stepping back from
   *  right at the true start would otherwise just clamp at 0 instead of
   *  actually moving — `correctSeam` catches exactly that case (settled
   *  within 4px of the true start) and jumps to its twin position with
   *  room to keep going, same as it would for a manual swipe landing
   *  there. */
  const retreat = () => {
    const el = trackRef.current;
    if (!el) return;
    runPopProgressLoop();
    schedulePopProgressStop(700);
    correctSeam();
    const step = measureStep(el);
    el.scrollBy({ left: -step, behavior: "smooth" });
  };

  /** A dot's handler — jumps straight to the product at `target`. Same
   *  `correctSeam` call as `advance`/`retreat`, though for a different
   *  reason here: `target * step` always addresses card `target` within
   *  copy 1's own coordinates regardless of where the row currently rests,
   *  so correctness never depended on this: it is here so a dot clicked
   *  while the row happens to be resting near a true edge does not first
   *  animate all the way across the doubled row before landing, the same
   *  visible-fly-past this call already prevents for `advance`/`retreat`. */
  const goTo = (target: number) => {
    const el = trackRef.current;
    if (!el) return;
    runPopProgressLoop();
    schedulePopProgressStop(700);
    correctSeam();
    const step = measureStep(el);
    el.scrollTo({ left: target * step, behavior: "smooth" });
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
     distinction is the entire fix.

     **`swipeResetSignal` is the one deliberate exception to "never tear
     this down just to restart the cadence"** (client, 2026-09-01: "After
     swipe the timer should be reset") — mobile only, bumped by `sync`'s own
     settle-timer once a gesture has genuinely stopped. A manual swipe and
     autoplay's own tick fighting over the same card within moments of each
     other is a worse feel than the interval's phase drifting by the ~120ms
     its own settle already takes, which is all restarting here costs — see
     the note on `sync` for why this is safe to fire unconditionally on
     every settle, autoplay's included.

     **`swipePausedRef` closes the gap that reset alone left open** (client,
     follow-up: "the timer when it is close to 3 seconds dosent reset when
     i swipe then. After i swipe near the 3 second limit it fires and
     swipes the next card") — the reset above only takes effect once
     `sync`'s settle-timer actually fires, itself 120ms plus a scroll-settle
     animation after the swipe, easily 300ms+ in total. A swipe landing
     inside that window left the *old* interval's already-scheduled tick
     free to fire anyway, doubling up with the visitor's own swipe — the
     reset was real, just not instant enough to close a race that short.
     Set the instant a touch starts (see the touch-listener effect,
     `swipePausedRef.current = true`) rather than only once settled, and
     checked below the same way `hoverPausedRef` already is, so any tick
     that would otherwise fire *during* a swipe — before the reset has even
     happened yet — is skipped instead of firing on the stale schedule. */
  const canAdvance = canLoop || canScroll.right;
  const running = autoplay && !paused && inView && canAdvance;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      /* Skip, don't reschedule. The interval keeps its own phase while the
         cursor sits on a footer, so leaving one resumes on the original
         cadence rather than restarting a fresh 3s — see `hoverPausedRef`.
         A tick spent hovering is simply lost, which is what "pause" should
         mean here: the belt does not "catch up" afterwards. Same for a
         tick landing mid-swipe (`swipePausedRef`) — it is not deferred
         either, since the swipe's own settle is about to reset this
         interval's phase anyway. */
      if (hoverPausedRef.current || modalPausedRef.current || swipePausedRef.current) return;
      /* No end to test for: `advance` carries the seam, so every tick is the
         same single step whether or not it happens to cross it. */
      advance();
    }, 3000);
    return () => window.clearInterval(id);
  }, [running, canLoop, swipeResetSignal]);

  if (products.length === 0) return null;

  /* The belt: one set for the eye, two duplicates so there is always a card
     following the last in either direction. `uid` keeps the three copies
     distinguishable — the pop below keys on it, and React needs it for `key`. */
  const slots = (canLoop ? [...products, ...products, ...products] : products).map(
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
           worked.

           **`mx-[calc(50%-50vw)]`, not `-mx-5 sm:-mx-6 lg:-mx-8`** (client,
           2026-08-27: "When i zoom out the page... i see that the featured
           product starts and ends not at the literal page ending but at a
           fixed position... whatever zoom is there it starts and ends at
           the literal page corners"). The old negative margin only
           cancelled `ui/Container`'s own side padding, which cancels the
           *container's* inset but does nothing once the container's
           `max-w-7xl` itself is narrower than the viewport — exactly the
           case a visitor create by zooming out, since that widens the
           viewport in CSS px without moving the cap. `calc(50% - 50vw)`
           does not have that ceiling: for any element inside a horizontally
           *centred* ancestor (`Container` is always `mx-auto`), that
           formula is algebraically identical to "cancel however far my own
           parent sits from the true viewport edge," whether that distance
           is a fixed padding, a max-width's leftover margin, or both at
           once — confirmed directly at three viewports (1280/1400/1920px,
           the last two both past the cap) that the track's own left edge
           now sits at the true viewport edge (`x: 0`) at all three, where
           it drifted to 60px then 320px before this. The matching `px-*`
           padding is untouched — it still reserves the same room for the
           popped-card shadow bleed described above, now measured from the
           true edge instead of the container's.

           **`justify-center` while `!canLoop`, `justify-start` while
           looping** (client, follow-up: "could you centre the featured
           product cards if they all fit when we zoom out... do not
           stretch instead just fit and centre"). The cards themselves
           already do not stretch — `w-[387px]` above is a fixed width,
           not a fraction of the track — but a fixed-width flex row
           narrower than its own container defaults to hugging the start
           edge, leaving the leftover space as a gap after the last card
           rather than split evenly around the whole row. Conditional, not
           always-on: `justify-center` on an *overflowing* flex row is
           unreliable across browsers for exactly what `scrollLeft: 0`
           then means (some centre the overflow symmetrically, which would
           break every "first card starts at the true edge" assumption
           `measureStep`/`correctSeam`/the CSS `scroll-padding-left` above
           all depend on) — `canLoop` already being false is precisely the
           signal that this row has no overflow to protect. */
        className={`hscroll mx-[calc(50%-50vw)] mt-8 flex snap-x snap-mandatory sm:snap-proximity items-stretch gap-6 overflow-x-auto px-6 pb-10 pt-16 sm:px-7 sm:[scroll-padding-left:28px] lg:px-9 lg:[scroll-padding-left:36px] ${
          canLoop ? "justify-start" : "justify-center"
        }`}
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
            /* `lg:w-[387px]`, a fixed pixel width, not
               `lg:w-[calc((100%-3rem)/3)]` — the other half of the zoom
               fix above, and the part that actually satisfies its second
               half (client: "If all products fit in the zoomed out page,
               then there is no need for movement or pause or anything").
               A percentage-of-track width is always exactly three cards
               *by construction*, at any track width, so a wider track
               (now genuinely reachable by zooming out, since the track is
               full-bleed above) would just render three *wider* cards
               forever rather than ever letting a fourth or fifth one join
               them — with 6 featured products, `canLoop` would then never
               go false no matter how far out anyone zoomed. A fixed width
               lets `clientWidth / cardWidth` grow instead: `measure`'s
               existing `canLoop = oneSet > el.clientWidth + 8` and
               `canScroll` already stop offering the belt, the arrows, the
               dots and the pause button the moment nothing actually
               overflows — that gating is untouched and already did
               everything the second half of the request asked for, once
               there was a way for more cards to actually fit at once.
               387px, not a rounder number: it is what the old
               `calc((100%-3rem)/3)` already rendered at exactly 1280px
               (measured directly, 386.7px), the one width where the old
               and new rules must agree — the page's own `Container
               size="wide"` caps at `max-w-7xl`, so 1280px is also the
               widest this ever rendered before today regardless of
               screen size, and nothing about how the row looks at or
               under that width should change now. */
            className={`relative w-[82%] flex-none snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-[387px] ${
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
            <div className="h-full">
              <ProductCard
                product={product}
                priority={true}
                orientation="featured"
                isPopped={poppedId === uid}
                onQuickViewOpenChange={(isOpen) => {
                  modalPausedRef.current = isOpen;
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      {/* Paging row, centred below the belt: `< • • • || • • • >` (client,
          2026-08-27 — "like in 03 info section of about us we have images
          right below that we have moving dots... I want to implement same
          thing for featured products sections below the cards... Where
          pause button is at centre, then at the corners we have < and >
          toggle buttons"). Direction arrows sat here until 2026-08-26, when
          they were removed; this reinstates them alongside the dots, not a
          straight revert — the pause control existed on its own between
          those two dates and keeps its own distinct, bordered styling here
          rather than being redesigned to match the now-bare arrows.

          Gated on there being more than one product *and* something to
          actually scroll (`canLoop`, or plain overflow via `canScroll`) —
          dots and arrows for a row that already shows everything would have
          nowhere to go. This is a broader gate than the pause button's own
          `autoplay && canAdvance` below: manual paging is still useful to a
          `prefers-reduced-motion` visitor who has autoplay switched off,
          which is exactly the case that gate alone would have hidden the
          whole row for. */}
      {products.length > 1 && (canLoop || canScroll.left || canScroll.right) && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <ArrowButton
            direction="left"
            label="Previous featured products"
            disabled={!canLoop && !canScroll.left}
            onClick={retreat}
          />

          <div className="flex items-center gap-1">
            {products.slice(0, Math.ceil(products.length / 2)).map((product, i) => (
              <Dot
                key={product.id}
                active={i === stepIndex}
                label={`Go to featured product ${i + 1}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>

          {/* WCAG 2.2.2: content that moves on its own for more than five
              seconds needs a way to stop it, and hovering is not one — it
              does nothing for a touch or keyboard visitor. Same control the
              hero carries, for the same reason. Gated on `canAdvance`, not
              just `autoplay`: a row with nothing to scroll never runs
              regardless of `autoplay`, so a pause button for it would have
              nothing to pause — and unlike the arrows/dots either side, this
              one genuinely has no purpose in that case. */}
          {autoplay && canAdvance && (
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
          )}

          <div className="flex items-center gap-1">
            {products.slice(Math.ceil(products.length / 2)).map((product, i) => {
              const index = i + Math.ceil(products.length / 2);
              return (
                <Dot
                  key={product.id}
                  active={index === stepIndex}
                  label={`Go to featured product ${index + 1}`}
                  onClick={() => goTo(index)}
                />
              );
            })}
          </div>

          <ArrowButton
            direction="right"
            label="Next featured products"
            disabled={!canLoop && !canScroll.right}
            onClick={advance}
          />
        </div>
      )}
    </div>
  );
}

/** One dot per product — same convention and styling as `about/AboutGallery`'s
 *  dots, which this row was explicitly modelled on. `h-9 w-4` gives each a
 *  thumb-sized hit area around a 6px mark, wider and accent-coloured when
 *  active. Not `<li>`-wrapped like that component's own dots: this row splits
 *  the dots either side of the pause button, and a `<button>` between two
 *  `<ul>`s that are not themselves inside any `<li>` is simpler than
 *  contorting three lists to keep one nested correctly. */
function Dot({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      className="group flex h-9 w-4 items-center justify-center"
    >
      <span
        className={`block h-1.5 rounded-full transition-all duration-300 ${
          active ? "w-5 bg-accent" : "w-1.5 bg-line-strong group-hover:bg-muted"
        }`}
      />
    </button>
  );
}

/** The `<`/`>` paging buttons — deliberately not styled like `PageButton`
 *  below (client, 2026-08-27: "they should not be a circle in design but
 *  just < and > no boundary"). No border, no background, no shadow: just the
 *  chevron, coloured `text-muted` at rest and darkening on hover, the same
 *  resting/hover pair as plain text links elsewhere on the site rather than
 *  a button-shaped control. `h-9 w-9` keeps a full 36px tap target even
 *  though nothing about it is visually a box. */
function ArrowButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center text-muted transition-colors duration-150 hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:text-muted"
    >
      <Icon className="h-5 w-5" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

/**
 * The pause/play control — its own square, bordered styling, unchanged by
 * the direction arrows returning alongside it 2026-08-27. It briefly shared
 * this component with those arrows before they were removed 2026-08-26; when
 * they came back, they came back as `ArrowButton` below, deliberately styled
 * as bare chevrons rather than folded back into this one's look (client:
 * "they should not be a circle in design... no boundary") — the two controls
 * now look different on purpose, not by accident of history.
 *
 * **`rounded-sm`, not `rounded-full`** (client, 2026-08-31: "lets make the
 * pause button in featured product have square boundary instead of round")
 * — matches `ui/Button`'s own default corner (`rounded-sm`, 2px) rather than
 * going fully sharp (`rounded-none`), the same "bordered rectangle, no
 * radius beyond 2px" convention already on record for this site's other
 * chrome (see `ProductCard`'s own note).
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
      className="flex h-[43px] w-[43px] items-center justify-center rounded-sm border border-line bg-surface-raised text-ink shadow-card transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out hover:border-ink hover:bg-surface-subtle hover:shadow-card-hover hover:[transform:scale(1.08)] disabled:cursor-default disabled:text-muted disabled:opacity-40 disabled:shadow-none disabled:hover:[transform:scale(1)]"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
