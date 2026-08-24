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
    /* Centred at every width, phone included (client, 2026-08-24). The figure
       and its label are centred on each other rather than left-aligned to the
       column, so the three read as a row of plaques — which is what a stat
       band is — instead of three left-aligned paragraphs. */
    <div ref={ref} className="text-center">
      {/* `tabular-nums` is load-bearing: without it the digits are
          proportional, every frame is a different width, and the figure
          jitters sideways for the whole run — most visibly on a 1 following
          a 0. `aria-hidden` on the animating half plus one `sr-only` final
          value keeps a screen reader from announcing a live-updating number
          it never asked for. */}
      <p
        aria-hidden
        className="font-mono text-[2.5rem] leading-none tabular-nums tracking-tight text-ink sm:text-[3.25rem]"
      >
        {shown}
        <span className="text-accent">{suffix}</span>
      </p>
      <p className="sr-only">{`${value}${suffix} ${label}`}</p>
      <p aria-hidden className="label-tech mt-3 text-muted">
        {label}
      </p>
    </div>
  );
}
