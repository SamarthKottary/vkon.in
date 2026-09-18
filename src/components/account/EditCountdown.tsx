"use client";

import { useEffect, useState } from "react";

/**
 * Milliseconds left until `until`, ticking every second; null for no deadline
 * (an unpaid order) and for the first instant before the clock has been read.
 *
 * The clock is read in a timer callback, never during render: `Date.now()`
 * in render differs between server and browser, and §9 keeps state writes
 * out of the body of an effect.
 */
export function useTimeLeft(until: string | null): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!until) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const every = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [until]);
  if (!until || now === null) return null;
  return Math.max(0, new Date(until).getTime() - now);
}

/**
 * "Time left to edit — 17h 42m 05s", in the address pop-up (client,
 * 2026-09-18). The window closes at 12 pm the day after the order was
 * confirmed (`addressEditWindow`), so it is at most about a day and a half:
 * hours, minutes and seconds are enough. At zero it says the window has
 * closed; the server refuses a change after that regardless.
 */
export function EditCountdown({ until, msLeft }: { until: string | null; msLeft: number | null }) {
  if (!until) {
    return (
      <p className="text-right text-xs leading-snug text-muted">
        No time limit until you pay,
        <br />
        then until 12 pm the next day
      </p>
    );
  }
  if (msLeft === null) return <p className="h-10" aria-hidden />;
  if (msLeft === 0) {
    return (
      <p role="status" className="text-right text-sm font-medium text-red-700">
        Editing has closed
      </p>
    );
  }
  const total = Math.floor(msLeft / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return (
    <p className="text-right leading-tight">
      <span className="label-tech block text-muted">Time left to edit</span>
      <span className="mt-1 block text-lg font-semibold tabular-nums text-ink" aria-live="off">
        {h}h {two(m)}m {two(s)}s
      </span>
    </p>
  );
}
