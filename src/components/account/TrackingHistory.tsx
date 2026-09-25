"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@/components/icons/ui";

/**
 * **Track this parcel**, with the courier's scans folded behind a chevron on
 * the same row (client, 2026-09-25).
 *
 * The scans were open by default, four of them plus a "show earlier" link —
 * a dozen lines of "Data Received / Out For Pickup" above the address and the
 * total, on a panel somebody opened to answer one question: where is it. The
 * answer is the line at the top of the panel; the history is for when that is
 * not enough.
 *
 * A client component rather than `<details>`: the summary would have to hold
 * the tracking link, and a click on that link would toggle the panel as a side
 * effect of opening the courier's site. The timeline itself is rendered on the
 * server and passed in as children, so nothing about the scans crosses as
 * data.
 */
export function TrackingHistory({
  href,
  count,
  children,
}: {
  href: string;
  /** How many scans there are, for the label nobody sees but a reader hears. */
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative mt-3">
      <div className="flex items-center justify-between gap-3">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-ink"
        >
          Track this parcel
        </a>

        {count > 0 && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-line-strong bg-surface text-ink transition-colors hover:border-ink"
          >
            <span className="sr-only">
              {open
                ? "Hide the courier's updates"
                : `Show the courier's ${count} update${count === 1 ? "" : "s"}`}
            </span>
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {/* **Over the panel below, not above it** (client, 2026-09-25): the
          scans used to push the address card down the page, so opening them
          moved everything somebody had just been reading. `relative` on the
          wrapper, `absolute` here, and the panel's own padding is matched so
          the list lines up with the button above it. */}
      {open && count > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto border border-accent bg-accent-soft p-4 shadow-card">
          {children}
        </div>
      )}
    </div>
  );
}
