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
  "mt-6 text-[2.5rem] font-normal leading-[1.05] tracking-normal text-band-ink sm:text-6xl lg:mt-3 lg:text-7xl";

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
      /* `flex flex-1 flex-col` so this fills the screenful `Hero`'s `min-h`
         asks for — see the note there. The artwork below is `absolute inset-0`
         against this box, so stretching it is what makes the photograph a full
         screen rather than a band; the copy takes the slack and the progress
         marks and figures ride the bottom edge. */
      className="relative flex flex-1 flex-col"
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
          {/* Scrim, in four layers, shaped so the darkness follows the text
              rather than covering the frame. The left is heavy, it falls away
              across the middle, and the right-hand edge is clear — which is
              the point: the artwork's subject sits right and should be seen.

              Every value here is measured against rendered pixels, not
              estimated. The harness hides the hero's text, screenshots the
              section, and samples the real background under each glyph — using
              **`Range` rects, not element boxes**. That distinction is not a
              detail: the eyebrow is a full-width `<p>` holding one short word,
              so its element box spans the whole container, and sampling it
              reads the bright right of the frame as though it sat behind text
              that is actually far left. It reported the eyebrow at 2.3:1 while
              the glyphs were over an 85%-covered left edge.

              Current figures: 93 runs across 3 slides x 3 widths, 0 below AA,
              tightest 5.41:1 on the mobile slide body.

              Re-measure after any change. The binding case is the commercial
              slide, a stand-in frame with a bright sky across its middle; real
              artwork shot to the brief in docs/ARCHITECTURE.md — subject right,
              left two-thirds quiet — will have more headroom than this. */}

          {/* Flat floor, and mobile only. At 390px the copy spans the full
              width, so a left-weighted gradient covers none of it. From `lg`
              the text moves into the left column and the horizontal pass takes
              over, so the floor lifts entirely and the photograph comes
              through.

              **The lift is at `lg`, not `sm`** — it was `36 / sm:8`, which left
              a hole at tablet width: the floor dropped at 640px but the copy
              does not move into the left column until 1024, so between the two
              the body spanned nearly the full width and ran past the
              horizontal gradient into the bright side. Measured at 768px it
              sat at 2.91:1 and 3.56:1 against the 4.5 it needs. The breakpoint
              has to match the one the *layout* changes at. */}
          <div className="absolute inset-0 bg-scrim/38 lg:bg-transparent" />
          {/* The horizontal pass, and the one that gives the frame its shape:
              heavy left, falling away to **transparent** at the right edge so
              the subject there is seen rather than dimmed. It was `to-scrim/13`
              with a flat floor beneath it, which put a film over the whole
              picture.

              The mid stop is 62. At 50 the desktop slide body measured 4.41:1
              against the 4.5 it needs — the industrial frame puts a bright
              overcast sky exactly where that copy sits. It only affects the
              left two-thirds, so raising it costs the bright edge nothing. */}
          <div className="absolute inset-0 bg-gradient-to-r from-scrim/85 via-scrim/62 to-transparent" />
          {/* Bottom band only. The stats row spans the full width down there,
              including the bright side, so it needs cover the mid and top of
              the frame do not. Its top stop is transparent — a uniform
              vertical pass is what dimmed the right-hand sky. */}
          <div className="absolute inset-0 bg-gradient-to-t from-scrim/58 via-transparent to-transparent" />
          {/* Top-left corner, following the eyebrow rather than the whole top
              edge. At 11px it needs the full 4.5:1 and is the tightest text in
              the hero; carrying that as a full-width vertical stop was what
              darkened the top-right corner. */}
          <div className="absolute inset-0 bg-gradient-to-br from-scrim/42 via-transparent to-transparent" />
        </div>
      )}

      {/* `flex-1` takes every pixel the screenful leaves over once the marks
          and figures below have taken theirs, and `justify-center` spends it
          evenly above and below the copy. That is what replaced the old fixed
          `lg:pt-36`: on a tall monitor the copy sits in the middle of the frame
          with air around it, on a short laptop the same block closes up to its
          padding, and neither case is a number anybody had to guess. */}
      <Container size="wide" className="relative flex flex-1 flex-col justify-center">
        {/* Asymmetric on purpose: the hero is trimmed from the bottom, where the
            progress marks and figures follow, not from the top where the
            headline needs air. These are now *minimums* — the floor the copy
            closes to on a viewport too short to give it slack — not the thing
            that sets the hero's height. */}
        <div className="max-w-4xl pb-14 pt-20 sm:pb-16 sm:pt-28 lg:pb-6 lg:pt-8">
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
                  <p className="mt-8 max-w-xl text-lg leading-relaxed text-band-body lg:mt-3">
                    {segment.body}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4 lg:mt-4">
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
                /* `lg:py-3` and no lower: the visible line is 3px, so the
                   padding is the whole target, and 3 + 24 keeps it at the
                   24px WCAG 2.5.8 minimum. An earlier pass had this at
                   `lg:py-1.5` while chasing a fixed hero height and left a
                   15px target — the screenful `min-h` now pays for the
                   difference out of slack instead of out of the control. */
                className="group w-10 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-accent sm:w-14 lg:py-3"
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
