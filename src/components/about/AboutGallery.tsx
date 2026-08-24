"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Container } from "@/components/ui/Container";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * The visitor's reduced-motion setting, live.
 *
 * `useSyncExternalStore` rather than an effect that calls `setState`: reading
 * the media query in an effect body and storing it is exactly the cascading
 * render the `react-hooks/set-state-in-effect` rule rejects, and it renders
 * one frame of "not reduced" before correcting itself. The server snapshot is
 * `false` — there is no way to know the preference while rendering on the
 * server, and the autoplay it gates cannot start until hydration anyway.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

export type GalleryImage = {
  src: string;
  /** Describes the photograph. These are placeholders, but a blank `alt` on a
   *  slide a visitor can page through would leave the control meaningless to a
   *  screen reader — there would be nothing to announce on arrival. */
  alt: string;
};

/**
 * The About page's photo belt — endless, with a dot per image and no other
 * controls.
 *
 * **There is no pause button or arrows, and hover/focus no longer park it
 * either** (client, 2026-08-24 — both were present until then, the second
 * removed in a later change than the first once it turned out to make the
 * belt look "stuck" whenever the pointer rested on it). WCAG 2.2.2 asks that
 * motion which starts automatically and runs more than five seconds have a
 * way for the visitor to pause it; both of these are deliberate departures
 * from that, made on explicit instruction and accepted with the trade-off
 * named at the time, not silently dropped. What is left: `dots` can still be
 * tabbed to, though pressing one jumps to that image rather than pausing, and
 * `prefers-reduced-motion` still suppresses the motion entirely for a visitor
 * who has asked for that at the OS level. Past that, there is no way to stop
 * it short of leaving the page.
 *
 * **It runs for as long as the page is open, not only while on screen**
 * (client, 2026-08-24 — an `IntersectionObserver` used to park it once
 * scrolled out of view; that gate is gone). A background *tab* still stops it
 * via the page-visibility check below — that one is not the same gate and
 * was not asked to go: a hidden tab still fires timers, so without it the
 * belt would run on unseen and a visitor returning to the tab would land
 * mid-image rather than where they left it.
 *
 * **It is an endless belt, not a carousel that rewinds** (client, 2026-08-24).
 * The list is rendered *twice* and the scroll position is pulled back by one
 * set-width whenever it drifts past the seam. Because the two copies are
 * identical at that offset, the reset is invisible: the first image simply
 * follows the last, and going backwards from the start does the mirror. The
 * earlier build scrolled back to zero instead, which read as the strip
 * snapping backwards — the thing this replaces.
 *
 * **The set-width is measured from the DOM, not `scrollWidth / 2`.** That
 * looks equivalent and is not: with a doubled list of `2N` items there are
 * `2N-1` gaps in total, so halving `scrollWidth` splits one gap's width
 * unevenly between the two copies rather than counting it once on each side.
 * Measured on this page it was off by 8px — small, but a "silent, invisible"
 * reset landing 8px short of the real seam is not invisible, and every wrap
 * jolted by that amount. `measureOneSet` instead reads the DOM offset between
 * slide 0 and its duplicate directly, which is exact regardless of gaps,
 * padding or borders because it never has to know about any of them.
 *
 * **The reset happens between animations, never inside one.** It is an
 * instant `scrollLeft` assignment issued *before* the smooth step, not during
 * it. Doing it mid-flight cancels the scroll already running and the belt
 * stutters at the seam. Same reasoning as `home/FeaturedProducts`, which uses
 * this idiom for the card belt.
 *
 * **A manual swipe gets the same correction, just later.** `page()` corrects
 * before it steps, which covers autoplay and the arrows, but a touch drag or
 * trackpad swipe never calls `page()` — it scrolls the element directly, and
 * nothing was correcting *that*. Past the seam with no correction, the belt
 * either ran out of track at the end of the second copy or waited for the
 * next autoplay tick to yank it back by a now-wrong amount — the "wild"
 * behaviour after the first loop. `onScroll` now arms a short settle timer on
 * every scroll event and corrects once it fires, i.e. once scrolling has
 * actually stopped — never mid-gesture, which is what would fight a touch
 * drag still in progress. Both paths call the same `measureOneSet`, so a
 * correction is pixel-exact and invisible regardless of who triggered it.
 *
 * **`onScroll` is throttled to one measurement per animation frame.** Native
 * scroll events can fire far more often than the display updates; measuring
 * on every one of them was wasted work between frames the visitor never sees.
 *
 * **It is a scroll container, not a transform track.** Paging calls
 * `scrollBy`, and the active dot is read back from `scrollLeft`. Touch swipe,
 * trackpad and shift-wheel therefore all work and all keep the dots in step,
 * because there is one source of truth for the position.
 */
export function AboutGallery({
  images,
  /** Milliseconds per image (client: faster than the previous 3s, 2026-08-24). */
  interval = 2000,
}: {
  images: GalleryImage[];
  interval?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [canLoop, setCanLoop] = useState(false);
  const reduced = usePrefersReducedMotion();
  /* Scroll-settle timer for `correctSeam`, and the animation-frame handle for
     throttling `sync` — both cleared on unmount below. */
  const settleTimer = useRef<number | null>(null);
  const syncFrame = useRef<number | null>(null);

  /* How far one step moves: a slide plus the gap after it, measured from the
     DOM so it follows the breakpoint without being told about it. */
  const stride = useCallback(() => {
    const first = trackRef.current?.firstElementChild as HTMLElement | null;
    const second = first?.nextElementSibling as HTMLElement | null;
    if (!first) return 1;
    return second
      ? second.offsetLeft - first.offsetLeft
      : first.offsetWidth || 1;
  }, []);

  /** The exact pixel offset between a slide and its duplicate — see the note
   *  at the top of the file for why this is not `scrollWidth / 2`. Reads
   *  `el.children` directly rather than iterating `slots`: the DOM is already
   *  doubled by the time this can meaningfully be called (both call sites are
   *  `canLoop`-gated), so the child at `images.length` *is* slide 0 of the
   *  second copy. */
  const measureOneSet = useCallback(
    (el: HTMLElement) => {
      const first = el.children[0] as HTMLElement | undefined;
      const second = el.children[images.length] as HTMLElement | undefined;
      return first && second
        ? second.offsetLeft - first.offsetLeft
        : el.scrollWidth / 2;
    },
    [images.length],
  );

  /** The actual DOM read: `canLoop` and which dot is lit. Split out from
   *  `sync` so `correctSeam` can call it directly, synchronously, in the same
   *  tick as the `scrollLeft` write that crosses the seam — otherwise the dot
   *  stays on the pre-jump image for the one frame between the write and the
   *  next scroll-driven `sync`. Same split as `home/FeaturedProducts`, where
   *  that one frame is far more visible: the "popped" card's highlight went
   *  dark for two to three frames and re-grew on the correct card, which read
   *  as a glitch layered on top of the position jump itself. */
  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;

    /* One set's width whether or not it is currently doubled, so turning the
       belt on cannot invalidate the measurement that turned it on. A coarse
       `scrollWidth / 2` is fine here — this only decides whether to double
       the list, not where the seam sits, so the 8px it can be off by never
       matters. */
    const oneSet = canLoop ? el.scrollWidth / 2 : el.scrollWidth;
    setCanLoop(oneSet > el.clientWidth + 8);

    /* Modulo, because past the seam the raw index counts into the duplicate
       set and there is no seventh dot to light. */
    setIndex(Math.round(el.scrollLeft / stride()) % images.length);
  }, [canLoop, images.length, stride]);

  /** Pulls the scroll position back across the seam if it has drifted past
   *  one set-width. Idempotent — safe to call from both the pre-step check in
   *  `advance`/`goTo` and the settle timer below without the two ever
   *  disagreeing, because both read the same measure. */
  const correctSeam = useCallback(() => {
    const el = trackRef.current;
    if (!el || !canLoop) return;
    const oneSet = measureOneSet(el);
    if (el.scrollLeft < oneSet) return;
    el.scrollLeft -= oneSet;
    measure();
  }, [canLoop, measureOneSet, measure]);

  /* Throttled to one run per animation frame: native `scroll` fires far more
     often than the display updates. */
  const sync = useCallback(() => {
    measure();

    /* Armed on every scroll, cleared and re-armed by the next one — so it
       only ever fires once scrolling has actually stopped, whatever caused
       it: touch drag, momentum, wheel or a dot jump. Correcting mid-gesture
       would mean fighting a touch drag still in progress. */
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
  }, [sync]);

  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      if (syncFrame.current !== null) window.cancelAnimationFrame(syncFrame.current);
    },
    [],
  );

  /** One image forward. Only ever called with the autoplay tick now that the
   *  arrows are gone — there is no `-1` case left to carry, so unlike
   *  `home/FeaturedProducts` (which still has arrows either direction) this
   *  one does not take a direction. */
  const advance = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const step = stride();

    /* Pre-corrects rather than waiting for the settle timer, so autoplay
       never has to sit through the 120ms delay — only a freeform scroll needs
       to wait for scrolling to actually stop. */
    if (canLoop) {
      const oneSet = measureOneSet(el);
      if (el.scrollLeft >= oneSet) el.scrollLeft -= oneSet;
    }

    el.scrollBy({ left: step, behavior: "smooth" });
  }, [canLoop, measureOneSet, stride]);

  /* A dot jumps within the *first* set, so the belt is left somewhere the
     seam logic can carry on from. */
  const goTo = useCallback(
    (target: number) => {
      const el = trackRef.current;
      if (!el) return;
      const step = stride();
      if (canLoop) {
        const oneSet = measureOneSet(el);
        if (el.scrollLeft >= oneSet) el.scrollLeft -= oneSet;
      }
      el.scrollTo({ left: target * step, behavior: "smooth" });
    },
    [canLoop, measureOneSet, stride],
  );

  /* A background *tab* still fires timers (throttled, not stopped), so
     without this the belt keeps stepping unseen and a visitor returning to
     the tab lands mid-image rather than where they left it. Not the same
     thing as the scroll-visibility gate this replaced — see the note on the
     component for why that one is gone and this one is not. Same pattern as
     `home/FeaturedProducts`. */
  const [tabHidden, setTabHidden] = useState(false);
  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const running = !reduced && !tabHidden && images.length > 1;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(advance, interval);
    return () => window.clearInterval(id);
  }, [running, interval, advance]);

  /* The doubled list. `uid` keeps the copies distinguishable as React keys —
     `src` alone appears twice and would collide. */
  const slots = (canLoop ? [...images, ...images] : images).map(
    (image, i) => ({ image, i, uid: `${image.src}#${i}` }),
  );

  return (
    <div className="relative">

      {/* `relative` positions the edge fades. */}
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={onScroll}
          /* `aria-roledescription` rather than a bare region: it tells a
             screen reader this is a carousel, so the arrows and dots read as
             its controls rather than as unexplained buttons. */
          role="group"
          aria-roledescription="carousel"
          aria-label="Photographs from our work"
          /* No `snap-*`. Scroll snapping fights the seam reset: the browser
             re-snaps to the nearest slide after the instant `scrollLeft`
             assignment and the belt jerks at the wrap. Paging is by a
             measured stride, so snap was only ever belt-and-braces. */
          className="hscroll flex gap-4 overflow-x-auto overscroll-x-contain"
        >
          {slots.map(({ image, i, uid }) => (
            <div
              key={uid}
              role="group"
              aria-roledescription="slide"
              aria-label={`${(i % images.length) + 1} of ${images.length}`}
              /* `inert`, not `aria-hidden`: the copies are duplicate content
                 that should leave the accessibility tree *and* the tab order
                 together. `aria-hidden` alone would leave anything focusable
                 inside reachable but unannounced, which is the pairing ARIA
                 forbids. */
              inert={canLoop && i >= images.length}
              /* ~60% of the old full-column slide (client asked for 40% off).
                 Sized in `vw` below `sm` so a phone shows one image plus the
                 edge of the next — the cue that there is more to swipe. */
              className="relative aspect-[16/9] w-full shrink-0 overflow-hidden border-y border-line bg-surface-subtle sm:w-[25.25rem] sm:border"
            >
              <Image
                src={image.src}
                alt={i < images.length ? image.alt : ""}
                fill
                sizes="(min-width: 640px) 25.25rem, 100vw"
                className="object-cover"
                loading={i < 2 ? undefined : "lazy"}
              />
            </div>
          ))}
        </div>

        {/* Both edges fade to the page rather than being cut by the viewport,
            so the belt reads as continuing past the frame. `pointer-events-none`
            keeps them off the scroll — without it the leftmost 4rem of the
            track cannot be dragged. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-16 bg-gradient-to-r from-surface to-transparent sm:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-16 bg-gradient-to-l from-surface to-transparent sm:block"
        />
      </div>

      {/* A dot per image, doubling as a jump target. `h-9 w-4` gives each a
          thumb-sized hit area around a 6px mark. Centred now that the arrows
          have moved onto the picture — right-aligned on their own they read
          as an orphaned fragment of the old control row. */}
      <Container size="wide" className="mt-4 flex justify-center">
        <ul className="flex items-center gap-1">
          {images.map((image, i) => {
            const active = i === index;
            return (
              <li key={image.src}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Go to photograph ${i + 1}`}
                  aria-current={active ? "true" : undefined}
                  className="group flex h-9 w-4 items-center justify-center"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all duration-300 ${
                      active
                        ? "w-5 bg-accent"
                        : "w-1.5 bg-line-strong group-hover:bg-muted"
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </Container>
    </div>
  );
}
