"use client";

import { useCallback, useEffect, useState } from "react";
import { PauseIcon, PlayIcon } from "@/components/icons/ui";
import type { HeroSegment } from "@/content/segments";

const SLIDE_MS = 5000;

/**
 * Rotating hero, one market segment at a time.
 *
 * Structure notes, each of which is load-bearing:
 *
 *  - **All slides stay in the DOM, stacked in one grid cell.** The section is
 *    then as tall as the tallest slide and never changes height, so rotation
 *    cannot shift the page. Swapping the children instead would jump the fold
 *    every five seconds.
 *  - **Inactive slides get `inert`,** which removes them from the tab order and
 *    the accessibility tree together. Without it a keyboard user tabs into
 *    invisible text and a screen reader announces all three at once.
 *  - **Only the first slide's headline is an `<h1>`.** Three `<h1>`s in the
 *    markup would be three to a crawler no matter what is visible, so the
 *    others are paragraphs wearing the same type.
 *  - **A pause control is not optional.** WCAG 2.2.2 requires a way to stop
 *    anything that moves on its own for more than five seconds; the button is
 *    the compliance mechanism, and hover alone would not satisfy it because it
 *    is unreachable from the keyboard.
 */
export function HeroRotator({ segments }: { segments: HeroSegment[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  /**
   * Auto-advance is off until the effect confirms motion is welcome, so a
   * reduced-motion visitor never sees a single unrequested transition — server
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
     ahead while nobody is watching and the visitor returns mid-transition. */
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="What Vkon builds"
    >
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
              <p className="label-tech text-band-accent">{segment.label}</p>

              {i === 0 ? (
                <h1 className="mt-6 text-[2.5rem] leading-[1.05] text-band-ink sm:text-6xl lg:text-7xl">
                  <HeadlineLines segment={segment} />
                </h1>
              ) : (
                /* No aria-hidden here: the inactive slides are already
                   removed from the accessibility tree by `inert`, and hiding
                   this too would mute the headline on the slide that is
                   actually showing. */
                <p className="mt-6 text-[2.5rem] leading-[1.05] text-band-ink sm:text-6xl lg:text-7xl">
                  <HeadlineLines segment={segment} />
                </p>
              )}

              <p className="mt-8 max-w-xl text-lg leading-relaxed text-band-muted">
                {segment.body}
              </p>
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-4">
          <ul className="flex flex-1 flex-wrap gap-x-6 gap-y-3">
            {segments.map((segment, i) => {
              const active = i === index;
              return (
                <li key={segment.key} className="min-w-[7rem] flex-1">
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={active ? "true" : undefined}
                    className={`group w-full text-left transition-colors ${
                      active
                        ? "text-band-ink"
                        : "text-band-muted hover:text-band-ink"
                    }`}
                  >
                    <span className="label-tech">{segment.label}</span>
                    <span className="mt-2 block h-px w-full bg-band-line">
                      {/* Restarting the fill needs a new element, so the key
                          carries the slide index as well as the run state. */}
                      <span
                        key={`${i}-${index}-${running}`}
                        style={
                          active && running
                            ? { animationDuration: `${SLIDE_MS}ms` }
                            : undefined
                        }
                        className={`block h-px origin-left bg-band-accent ${
                          active
                            ? running
                              ? "hero-progress"
                              : "w-full"
                            : "w-0"
                        }`}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {autoplay && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="flex h-9 w-9 shrink-0 items-center justify-center border border-band-line text-band-muted transition-colors hover:border-band-accent hover:text-band-ink"
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
        </div>
      )}

      {/* Announces the slide change to a screen reader without moving focus. */}
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
      <span className="block text-band-muted">{segment.headlineTail}</span>
    </>
  );
}
