"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
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
 * Stating the heading typography explicitly is what keeps the tag choice a
 * semantic decision rather than a visual one.
 */
const HEADLINE =
  "mt-6 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-balance text-band-ink sm:text-6xl lg:text-7xl";

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
 * The progress bar is rendered outside `Container` on purpose, so it runs the
 * full width of the viewport at every breakpoint. Its segments are `flex-1`,
 * so adding a fourth or fifth entry to `heroSegments` re-divides the bar with
 * no layout change — nothing here is hard-coded to three.
 */
export function HeroRotator({
  segments,
  children,
}: {
  segments: HeroSegment[];
  /** The call-to-action row, rendered on the server and slotted in below. */
  children?: ReactNode;
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

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => go(index + 1), SLIDE_MS);
    return () => window.clearTimeout(timer);
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
          <div className="absolute inset-0 bg-band/30 sm:bg-band/5" />
          <div className="absolute inset-0 bg-gradient-to-r from-band/85 via-band/55 to-band/15" />
          <div className="absolute inset-0 bg-gradient-to-t from-band/65 via-transparent to-band/40" />
        </div>
      )}

      <Container size="wide" className="relative">
        <div className="max-w-4xl py-20 sm:py-28 lg:py-36">
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

        {/* Pinned to the container edge rather than dropped at the end of the
            CTA row: `ml-auto` there would align it to the text column, which
            leaves it stranded mid-page on a wide screen. Sitting just above
            the bar, it reads as that bar's control. */}
        {autoplay && count > 1 && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="absolute bottom-0 right-5 flex h-9 w-9 items-center justify-center border border-band-line text-band-muted transition-colors hover:border-band-accent hover:text-band-ink sm:right-6 lg:right-8"
          >
            {paused ? (
              <PlayIcon className="h-3.5 w-3.5" />
            ) : (
              <PauseIcon className="h-3.5 w-3.5" />
            )}
            <span className="sr-only">
              {paused ? "Resume" : "Pause"} the rotating banner
            </span>
          </button>
        )}
      </Container>

      {count > 1 && (
        <div className="relative flex w-full gap-1.5">
          {segments.map((segment, i) => {
            const active = i === index;
            return (
              <button
                key={segment.key}
                type="button"
                onClick={() => go(i)}
                aria-current={active ? "true" : undefined}
                /* The visible mark is 2px tall; the padding is what makes this
                   a real touch target. */
                className="group flex-1 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-accent"
              >
                <span className="sr-only">Show {segment.label}</span>
                <span className="block h-0.5 w-full bg-band-line transition-colors group-hover:bg-band-muted">
                  {/* Restarting the fill needs a fresh element, so the key
                      carries the active index and the run state. */}
                  <span
                    key={`${i}-${index}-${running}`}
                    style={
                      active && running
                        ? { animationDuration: `${SLIDE_MS}ms` }
                        : undefined
                    }
                    className={`block h-0.5 origin-left bg-band-accent ${
                      active ? (running ? "hero-progress" : "w-full") : "w-0"
                    }`}
                  />
                </span>
              </button>
            );
          })}
        </div>
      )}

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
