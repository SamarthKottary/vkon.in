"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up from zero when it is first scrolled into view.
 *
 * **It counts once, not every time it passes.** The observer disconnects on
 * the first intersection. A figure that re-runs whenever the visitor scrolls
 * back up reads as a loading state rather than a fact, and on a phone — where
 * this row is a tall single column — scrolling past it twice is ordinary.
 *
 * **The final value is the server-rendered text.** `value` is printed in full
 * on the server and for the first client paint; the animation only starts
 * once the effect runs and the row is in view. So the figure is correct with
 * JavaScript disabled, correct for a crawler, and correct in the moment
 * between hydration and the row being reached — the count is decoration over
 * a number that is already right, never the only way to get it.
 *
 * **`prefers-reduced-motion` skips it entirely**, leaving the static value.
 * A counter is precisely the kind of unprompted movement that setting is for.
 *
 * The tick is driven by `requestAnimationFrame` rather than `setInterval` so
 * it advances with the display: an interval fast enough to look smooth on a
 * 120Hz screen burns frames on the low-end Androids this site targets, and one
 * slow enough for them stutters everywhere else.
 */
export function StatCounter({
  value,
  suffix = "",
  label,
  /** Milliseconds for the whole run. Long enough to read as a count. */
  duration = 1600,
}: {
  value: number;
  suffix?: string;
  label: string;
  duration?: number;
}) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    let frame = 0;
    let start: number | null = null;

    const step = (now: number) => {
      if (start === null) start = now;
      const t = Math.min((now - start) / duration, 1);
      /* Ease-out cubic: fast at the start, settling onto the final figure.
         Linear counting looks mechanical and, worse, spends as long on the
         last few units as the first — which is the part nobody watches. */
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(eased * value));
      if (t < 1) frame = window.requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        /* Once only — see the note above. Disconnecting here rather than
           tracking a "has run" flag also stops the observer doing work for
           the rest of the page's life. */
        observer.disconnect();
        setShown(0);
        frame = window.requestAnimationFrame(step);
      },
      /* Well inside the viewport, so the count is not already finished by the
         time the row is properly on screen. */
      { threshold: 0.4 },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <div ref={ref} className="text-center px-4">
      <p
        aria-hidden
        className="font-sans font-bold text-4xl sm:text-5xl lg:text-[3.5rem] leading-none tabular-nums tracking-tight text-ink"
      >
        {shown}
        <span className="text-accent">{suffix}</span>
      </p>
      <p className="sr-only">{`${value}${suffix} ${label}`}</p>
      <p aria-hidden className="mt-3 text-sm sm:text-base font-medium text-muted">
        {label}
      </p>
    </div>
  );
}
