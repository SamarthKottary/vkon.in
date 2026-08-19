"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import type { HeroSegment } from "@/content/segments";

const SLIDE_MS = 5000;

/**
 * Shared by all slides, and not optional.
 *
 * Only slide one is an <h1>; the rest are paragraphs so the markup does not
 * carry three <h1> elements. But the weight and tracking here come from the
 * base stylesheet's heading rules, which a <p> never receives — so the later
 * slides silently rendered at 400 weight with normal tracking while the first
 * was 600 at -0.03em. Same family, same size, visibly different type.
 *
 * The hero is set lighter than the rest of the site's headings by choice:
 * regular weight at normal tracking, not the 600/-0.03em the base stylesheet
 * gives an <h1>. `font-normal` and `tracking-normal` are therefore doing real
 * work on slide one — remove them and it reverts to the heading style while the
 * other two stay light.
 */
const HEADLINE =
  "mt-6 text-[2.5rem] font-normal leading-[1.05] tracking-normal text-band-ink sm:text-6xl lg:text-7xl";

/**
 * Rotating hero, one market segment at a time.
 *
 * Structure notes, each of which is load-bearing:
 *
 *  - **All slides stay mounted, stacked in one grid cell.** The hero is then as
 *    tall as its tallest slide and never changes height, so rotation cannot
 *    shift the fold. Swapping children instead would jump the page every five
 *    seconds.
 *  - **Inactive slides carry `inert`,** which removes them from the tab order
 *    and the accessibility tree together. Without it a keyboard user tabs into
 *    invisible text and a screen reader announces every slide at once. Do not
 *    also set `aria-hidden` on a slide's headline — that would mute it on the
 *    slide that is actually showing.
 *  - **Only the first slide's headline is an `<h1>`.** Every slide is in the
 *    markup, so three `<h1>`s would be three to a crawler no matter what is
 *    painted. The rest are paragraphs wearing the same type scale.
 *  - **The pause button is WCAG 2.2.2**, not a nicety: anything moving on its
 *    own for over five seconds needs a stop control, and hover does not count
 *    because a keyboard cannot reach it.
 *
 * The progress marks are short fixed-width lines centred as a group, one per
 * segment, with the fill travelling left to right. Adding a fourth or fifth
 * entry to `heroSegments` adds a mark rather than resizing the others —
 * nothing here is hard-coded to three.
 */
export function HeroRotator({
  segments,
  children,
  footer,
}: {
  segments: HeroSegment[];
  /** The call-to-action row, rendered on the server and slotted in below. */
  children?: ReactNode;
  /**
   * Rendered below the progress bar and *inside* the artwork's box, so the
   * photograph and its scrim run behind it rather than stopping above it.
   * Anything placed here sits on the image, so it must use band tokens.
   */
  footer?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  /**
   * Autoplay stays off until an effect confirms motion is welcome, so a
   * reduced-motion visitor never sees one unrequested transition — server
   * markup and first paint both show slide one, stationary.
   */
  const [autoplay, setAutoplay] = useState(false);
  const count = segments.length;

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  useEffect(() => {
    if (count < 2) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAutoplay(!motion.matches);
    sync();
    motion.addEventListener("change", sync);
    return () => motion.removeEventListener("change", sync);
  }, [count]);

  const running = autoplay && !paused;

  /**
   * Time left on the current slide.
   *
   * Pausing must freeze the slide where it stands, not restart it — so the
   * timer cannot simply be a fresh SLIDE_MS on every resume. The cleanup below
   * subtracts however long the timer actually ran, and the next run picks up
   * the remainder. Declared before the timer effect so a slide change resets
   * the budget before the new timer reads it.
   */
  const remainingRef = useRef(SLIDE_MS);
  const startedAtRef = useRef(0);

  useEffect(() => {
    remainingRef.current = SLIDE_MS;
  }, [index]);

  useEffect(() => {
    if (!running) return;
    startedAtRef.current = Date.now();
    const timer = window.setTimeout(() => go(index + 1), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAtRef.current),
      );
    };
  }, [running, index, go]);

  /* A background tab still fires timers, so without this the carousel races
     ahead unseen and the visitor returns to it mid-transition. */
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const hasArtwork = segments.some((s) => s.image);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="What Vkon builds"
      className="relative"
    >
      {hasArtwork && (
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          {segments.map((segment, i) =>
            segment.image ? (
              <Image
                key={segment.key}
                src={segment.image}
                alt=""
                fill
                sizes="100vw"
                priority={i === 0}
                style={{ "--focus": segment.focus ?? "100% 50%" } as React.CSSProperties}
                className={`object-cover object-[var(--focus)] transition-opacity duration-700 sm:object-center ${
                  i === index ? "opacity-100" : "opacity-0"
                }`}
              />
            ) : null,
          )}
          {/* Scrim, in three layers. Measured against real rendered pixels, not
              estimated: without it the 11px eyebrow over the solar frame sits
              at 2.9:1 where it needs 4.5.

              The flat floor is far heavier on mobile because the layout is
              different, not because phones need dimmer pictures — at 390px the
              copy spans the full width, so a left-weighted gradient covers
              none of it. On desktop the text stays in the left column and the
              horizontal gradient does most of the work, so the floor can back
              off and let the photograph through. */}
          {/* `scrim`, not `band` — see the token's note in globals.css. The
              band is now light enough to read as green on the footer, which is
              too light to protect text over a sunlit photograph.

              The floor lifts at `lg`, not at `sm`. It was `36 / sm:8`, which
              left a hole at tablet width: the flat floor dropped at 640px but
              the copy does not move into the left column until `lg` at 1024,
              so between the two the body text spans nearly the full width and
              runs out past the horizontal gradient into the bright side of the
              frame. Measured against rendered pixels at 768px, the slide body
              sat at 2.91:1 and 3.56:1 against the 4.5 it needs; an intermediate
              `sm:30` step got it to 4.08 and `36` to 4.47, both still short.
              The breakpoint has to match the one the *layout* changes at, which
              is `lg`, and the floor needs 40 to clear it. 1440px is untouched.

              The binding case is the commercial slide, which is currently a
              stand-in frame with a bright sky across its middle. Real artwork
              shot to the brief in docs/ARCHITECTURE.md — subject right, left
              two-thirds quiet — will have far more headroom, and this floor can
              come back down when it lands. Re-measure before changing it. */}
          <div className="absolute inset-0 bg-scrim/38 lg:bg-scrim/7" />
          {/* The mid stop is 64, not the 55 it was. The industrial frame puts a
              bright overcast sky across the middle of the picture, exactly
              where the slide body sits at desktop width — it measured 4.37:1
              against the 4.5 it needs. The left and right stops are unchanged,
              so the shadowed left and the bright right edge look as they did. */}
          <div className="absolute inset-0 bg-gradient-to-r from-scrim/82 via-scrim/60 to-scrim/13" />
          <div className="absolute inset-0 bg-gradient-to-t from-scrim/60 via-transparent to-scrim/36" />
        </div>
      )}

      <Container size="wide" className="relative">
        {/* Asymmetric on purpose: the hero is trimmed from the bottom, where the
            progress marks and figures follow, not from the top where the
            headline needs air. */}
        <div className="max-w-4xl pb-14 pt-20 sm:pb-16 sm:pt-28 lg:pb-20 lg:pt-36">
          <div className="grid">
            {segments.map((segment, i) => {
              const active = i === index;
              return (
                <div
                  key={segment.key}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${count}: ${segment.label}`}
                  inert={!active}
                  className={`col-start-1 row-start-1 transition-opacity duration-500 ${
                    active ? "opacity-100" : "pointer-events-none opacity-0"
                  }`}
                >
                  {/* accent-strong, not accent: this is 11px over a
                      photograph, so it needs 4.5:1, and it is the single
                      constraint that decides how dark the scrim has to be. */}
                  <p className="label-tech text-band-accent-strong">
                    {segment.label}
                  </p>

                  {i === 0 ? (
                    <h1 className={HEADLINE}>
                      <HeadlineLines segment={segment} />
                    </h1>
                  ) : (
                    <p className={HEADLINE}>
                      <HeadlineLines segment={segment} />
                    </p>
                  )}

                  {/* band-body, not band-muted. Over a photograph the dimmer
                      grey forces the scrim darker to hold 4.5:1 — brightening
                      the text by one step buys far more headroom than dimming
                      the picture, and the picture is the point. */}
                  <p className="mt-8 max-w-xl text-lg leading-relaxed text-band-body">
                    {segment.body}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
            {children}
          </div>
        </div>

      </Container>

      {count > 1 && (
        <div className="relative flex w-full items-center justify-center gap-2.5">
          {segments.map((segment, i) => {
            const active = i === index;
            return (
              <button
                key={segment.key}
                type="button"
                onClick={() => go(i)}
                aria-current={active ? "true" : undefined}
                /* Fixed narrow marks centred as a group, rather than
                   `flex-1` marks spanning the viewport. The visible line is
                   2px tall; the padding is what makes this a real touch
                   target. */
                className="group w-10 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-accent sm:w-14"
              >
                <span className="sr-only">Show {segment.label}</span>
                {/* band-ink at low alpha, not band-line. Over a photograph the dark
                    line token disappears and the control reads as a single
                    mark, hiding how many slides there are. */}
                <span className="block h-[3px] w-full bg-band-ink/30 transition-colors group-hover:bg-band-ink/60">
                  {/* The key is the slide index alone, so pausing does NOT
                      remount this element — it only flips animation-play-state,
                      which freezes the fill mid-travel and resumes from the
                      same point. Keying on `running` (as this once did) tore
                      the element down on pause, which snapped the line to full
                      and restarted it from zero on resume. */}
                  {active && autoplay ? (
                    <span
                      key={index}
                      style={{
                        animationDuration: `${SLIDE_MS}ms`,
                        animationPlayState: running ? "running" : "paused",
                      }}
                      className="hero-progress block h-[3px] origin-left bg-band-accent"
                    />
                  ) : (
                    <span
                      className={`block h-[3px] origin-left bg-band-accent ${
                        active ? "w-full" : "w-0"
                      }`}
                    />
                  )}
                </span>
              </button>
            );
          })}

          {/* Sits at the end of the marks, as their control. It was pinned to
              the container's right edge while the bar ran full width; with the
              marks centred that left it stranded on the far side of the page,
              related to nothing. */}
          {autoplay && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center border border-band-ink/30 text-band-ink/70 transition-colors hover:border-band-accent hover:text-band-ink"
            >
              {paused ? (
                <PlayIcon className="h-3 w-3" />
              ) : (
                <PauseIcon className="h-3 w-3" />
              )}
              <span className="sr-only">
                {paused ? "Resume" : "Pause"} the rotating banner
              </span>
            </button>
          )}
        </div>
      )}

      {footer && <div className="relative">{footer}</div>}

      {/* Announces the change to a screen reader without moving focus. */}
      <p aria-live="polite" className="sr-only">
        {`${segments[index].label}, slide ${index + 1} of ${count}`}
      </p>
    </div>
  );
}

function HeadlineLines({ segment }: { segment: HeroSegment }) {
  return (
    <>
      {segment.headline.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
      {/* band-body rather than band-muted. Still visibly a step down from the
          white lines above it, but muted grey at 40px was the single thing
          forcing the scrim darker once the eyebrow was fixed. */}
      <span className="block text-band-body">{segment.headlineTail}</span>
    </>
  );
}
