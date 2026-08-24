"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PauseIcon,
  PlayIcon,
} from "@/components/icons/ui";
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
 * The About page's photo belt — endless, with arrows, a pause control and a
 * dot per image.
 *
 * **It is an endless belt, not a carousel that rewinds** (client, 2026-08-24).
 * The list is rendered *twice* and the scroll position is pulled back by one
 * set-width whenever it drifts past the seam. Because the two copies are
 * identical at that offset, the reset is invisible: the first image simply
 * follows the last, and going backwards from the start does the mirror. The
 * earlier build scrolled back to zero instead, which read as the strip
 * snapping backwards — the thing this replaces.
 *
 * **The reset happens between animations, never inside one.** It is an
 * instant `scrollLeft` assignment issued *before* the smooth step, not during
 * it. Doing it mid-flight cancels the scroll already running and the belt
 * stutters at the seam. Same reasoning as `home/FeaturedProducts`, which uses
 * this idiom for the card belt.
 *
 * **It is a scroll container, not a transform track.** Paging calls
 * `scrollBy`, and the active dot is read back from `scrollLeft`. Touch swipe,
 * trackpad and shift-wheel therefore all work and all keep the dots in step,
 * because there is one source of truth for the position.
 *
 * **Pausing is required, not a nicety.** WCAG 2.2.2 asks that motion which
 * starts automatically and runs more than five seconds can be paused. The
 * button is that mechanism; `prefers-reduced-motion` suppresses the motion
 * before it starts, and hover, focus and leaving the viewport park it too.
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
  const [playing, setPlaying] = useState(true);
  const [engaged, setEngaged] = useState(false);
  const [inView, setInView] = useState(true);
  const [canLoop, setCanLoop] = useState(false);
  const reduced = usePrefersReducedMotion();

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

  /* Looping only earns its duplicate set when one set is actually wider than
     the frame. With three images on a wide desktop the strip does not scroll
     at all, and a belt of six that never moves is just six images. */
  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;

    /* One set's width whether or not it is currently doubled, so turning the
       belt on cannot invalidate the measurement that turned it on. */
    const oneSet = canLoop ? el.scrollWidth / 2 : el.scrollWidth;
    setCanLoop(oneSet > el.clientWidth + 8);

    /* Modulo, because past the seam the raw index counts into the duplicate
       set and there is no seventh dot to light. */
    setIndex(Math.round(el.scrollLeft / stride()) % images.length);
  }, [canLoop, images.length, stride]);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync]);

  /** Pulls the scroll position back across the seam if it has drifted past one
   *  set-width. Instant, and only ever called before a smooth step. */
  const normaliseSeam = useCallback(
    (el: HTMLElement, direction: 1 | -1, step: number) => {
      if (!canLoop) return;
      const oneSet = el.scrollWidth / 2;
      if (direction === 1 && el.scrollLeft >= oneSet) el.scrollLeft -= oneSet;
      else if (direction === -1 && el.scrollLeft < step) el.scrollLeft += oneSet;
    },
    [canLoop],
  );

  const page = useCallback(
    (direction: 1 | -1) => {
      const el = trackRef.current;
      if (!el) return;
      const step = stride();
      normaliseSeam(el, direction, step);
      el.scrollBy({ left: step * direction, behavior: "smooth" });
    },
    [normaliseSeam, stride],
  );

  /* A dot jumps within the *first* set, so the belt is left somewhere the
     seam logic can carry on from. */
  const goTo = useCallback(
    (target: number) => {
      const el = trackRef.current;
      if (!el) return;
      const step = stride();
      if (canLoop) {
        const oneSet = el.scrollWidth / 2;
        if (el.scrollLeft >= oneSet) el.scrollLeft -= oneSet;
      }
      el.scrollTo({ left: target * step, behavior: "smooth" });
    },
    [canLoop, stride],
  );

  /* Parked while off screen. Without this the interval keeps firing and the
     strip is several images along by the time it is scrolled back to. */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const running =
    playing && !engaged && !reduced && inView && images.length > 1;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => page(1), interval);
    return () => window.clearInterval(id);
  }, [running, interval, page]);

  /* The doubled list. `uid` keeps the copies distinguishable as React keys —
     `src` alone appears twice and would collide. */
  const slots = (canLoop ? [...images, ...images] : images).map(
    (image, i) => ({ image, i, uid: `${image.src}#${i}` }),
  );

  return (
    <div className="relative">
      {/* Controls above the strip, at its top right (client, 2026-08-24) —
          they were overlaid on the photographs until then. Above rather than
          over means they never cover a picture, and on a phone, where one
          image now fills the frame, an overlay would have sat on the subject.
          Aligned to the `Container` edge, not the window's, so they line up
          with the text above even though the belt runs wider. */}
      <Container size="wide" className="mb-4 flex justify-end gap-2">
        <GalleryButton onClick={() => page(-1)} label="Previous photograph">
          <ArrowLeftIcon className="h-4 w-4" />
        </GalleryButton>
        <GalleryButton onClick={() => page(1)} label="Next photograph">
          <ArrowRightIcon className="h-4 w-4" />
        </GalleryButton>
        <GalleryButton
          onClick={() => setPlaying((on) => !on)}
          label={playing ? "Pause the slideshow" : "Play the slideshow"}
          pressed={!playing}
        >
          {playing ? (
            <PauseIcon className="h-4 w-4" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
        </GalleryButton>
      </Container>

      <div
        /* `relative` positions the edge fades. */
        className="relative"
        /* Hover and focus park the belt. */
        onMouseEnter={() => setEngaged(true)}
        onMouseLeave={() => setEngaged(false)}
        onFocus={() => setEngaged(true)}
        onBlur={() => setEngaged(false)}
      >
        <div
          ref={trackRef}
          onScroll={sync}
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

function GalleryButton({
  onClick,
  label,
  pressed,
  children,
}: {
  onClick: () => void;
  label: string;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className="flex h-10 w-10 items-center justify-center border border-line bg-surface-raised text-ink shadow-card transition-colors hover:border-line-strong hover:bg-surface-subtle active:scale-95"
    >
      {children}
    </button>
  );
}
