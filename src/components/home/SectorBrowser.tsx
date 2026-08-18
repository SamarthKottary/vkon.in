"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
} from "@/components/icons/ui";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import type { CategoryMeta, SectorMeta } from "@/lib/types";

export type SectorGroup = {
  sector: SectorMeta;
  /** The sector's sub-categories, with how many published products each holds. */
  categories: { category: CategoryMeta; count: number }[];
  /** Published products across the whole sector. */
  total: number;
};

/**
 * The sector browser on the home page — "What we make".
 *
 * A horizontal track of the three market sectors that pages with the arrow
 * buttons or by ordinary scrolling. Opening a card lists that sector's
 * sub-categories; each one links to the catalogue filtered to it.
 *
 * This replaced a browser over product categories on 2026-08-18, when the site
 * gained a sector above them. The level shown here has to match the hero — a
 * visitor who has just watched "Agriculture / Industrial / Commercial" rotate
 * past reads the next section as the same three things opened up, and showing
 * five product categories there instead read as a different taxonomy entirely.
 *
 * Notes worth keeping:
 *
 *  - **The panel belongs to its own card**, directly beneath it and the same
 *    width, so the sub-categories visibly belong to the sector above them. The
 *    track is `items-start` so only the opened card grows; the others keep
 *    their height instead of stretching to match. The cards carry a `min-h` so
 *    they still look even while closed.
 *  - **Card widths are `calc` fractions of the container**, so exactly three
 *    land on a wide screen no matter how many sectors exist. A fourth adds a
 *    card to scroll to; it does not shrink the other three.
 *  - **Arrows sit above the row, right-aligned, and disable at the ends**
 *    rather than disappearing, so the control never moves. They are hidden
 *    entirely when everything already fits, since a control that can never do
 *    anything is noise.
 *  - **A sub-category with nothing in it is listed but not linked.** The
 *    catalogue only offers filters that have products behind them, so a link to
 *    an empty one lands on "No products match those filters" — a dead end. It
 *    reads "Coming soon" instead, which is the true statement anyway.
 */
export function SectorBrowser({ groups }: { groups: SectorGroup[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({
      left: el.scrollLeft > 4,
      right: el.scrollLeft < max - 4,
    });
  }, []);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync, groups.length]);

  /** Pages by one card, measured from the DOM so it tracks the breakpoint. */
  const page = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 24 : el.clientWidth;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  const showArrows = canScroll.left || canScroll.right;

  return (
    <div className="reveal-stagger">
      {showArrows && (
        <div className="mb-6 flex items-center justify-end gap-3">
          <PageButton
            label="Previous markets"
            disabled={!canScroll.left}
            onClick={() => page(-1)}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </PageButton>
          <PageButton
            label="More markets"
            disabled={!canScroll.right}
            onClick={() => page(1)}
          >
            <ArrowRightIcon className="h-4 w-4" />
          </PageButton>
        </div>
      )}

      {/* `reveal-stagger` on the wrapper, not here: the cards animate one
          after another on a named timeline the track publishes. See the
          comment beside the utility in globals.css for why a plain `view()`
          on the cards would be timed to sideways scrolling instead. */}
      <ul
        ref={trackRef}
        onScroll={sync}
        className="hscroll flex snap-x snap-mandatory items-start gap-6 overflow-x-auto"
      >
        {groups.map(({ sector, categories, total }) => {
          const isOpen = openKey === sector.key;
          const expandable = categories.length > 0;

          return (
            <li
              key={sector.key}
              className="w-[82%] flex-none snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`sector-panel-${sector.key}`}
                disabled={!expandable}
                onClick={() => setOpenKey(isOpen ? null : sector.key)}
                /* No dimmed state for a sector with nothing under it. They are
                   part of the range and read as available; greying them made
                   the empty ones look broken next to the one with stock. */
                className={`flex min-h-[19rem] w-full flex-col border bg-surface-raised p-6 text-left shadow-card transition-[box-shadow,border-color] duration-200 ${
                  isOpen
                    ? "border-accent shadow-card-hover"
                    : "border-line hover:border-line-strong hover:shadow-card-hover"
                }`}
              >
                <span /* 16:9, matching what the image generator actually offers.
                       The plate and the artwork share a ratio on purpose: with
                       `object-cover` any mismatch crops the frame, and these are
                       composed with the subject in the right third. */
                    className="relative -mx-6 -mt-6 mb-5 block aspect-video overflow-hidden border-b border-line bg-surface-subtle">
                  {sector.image ? (
                    <Image
                      src={sector.image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 82vw"
                      className="object-cover"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <PanelPlaceholder className="h-14 w-14" />
                    </span>
                  )}
                </span>

                <h3 className="text-lg leading-snug">{sector.label}</h3>
                {/* Ten, not seven. The copy is written to land on about seven
                    lines at desktop width, but the same text needs ten on a
                    390px card — clamping at seven cut it off mid-sentence on a
                    phone. The clamp is a guard against runaway copy, not the
                    target length. */}
                <p className="mt-2 line-clamp-10 text-sm leading-relaxed text-muted">
                  {sector.description}
                </p>

                <span className="mt-auto flex items-center justify-between gap-4 pt-6">
                  <span className="label-tech text-muted">
                    {!expandable
                      ? "Coming soon"
                      : `${categories.length} ${
                          categories.length === 1 ? "category" : "categories"
                        }`}
                  </span>
                  {expandable && (
                    <ChevronDownIcon
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-accent" : "text-muted"
                      }`}
                    />
                  )}
                </span>
              </button>

              {/* Dynamic: the panel sizes to its contents and the section grows
                  when a card opens.

                  This replaced a fixed-height reserved block on 2026-08-13, at
                  the client's request. The trade-off is deliberate and worth
                  knowing: the reserved block was what kept the contact section
                  from moving when a card opened. With the panel dynamic, the
                  page below shifts down by the panel's height. */}
              {isOpen && (
                <ul
                  id={`sector-panel-${sector.key}`}
                  /* Accent border, matching the open card above it: with the
                     card outlined in accent and the panel in the line token,
                     the two read as separate objects rather than one open
                     card. */
                  className="flex flex-col border border-t-0 border-accent bg-surface-subtle px-6 py-2"
                >
                  {categories.map(({ category, count }) => (
                    <li key={category.key} className="border-b border-line">
                      {count > 0 ? (
                        <Link
                          href={`/products?category=${category.key}`}
                          className="group flex items-center justify-between gap-4 py-3 text-[0.9375rem] text-ink transition-colors hover:text-accent"
                        >
                          <span>
                            {category.label}
                            <span className="ml-2 text-sm text-muted">
                              {count}
                            </span>
                          </span>
                          <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-accent" />
                        </Link>
                      ) : (
                        <p className="flex items-center justify-between gap-4 py-3 text-[0.9375rem] text-muted">
                          {category.label}
                          <span className="label-tech shrink-0">Coming soon</span>
                        </p>
                      )}
                    </li>
                  ))}

                  {total > 0 && (
                    <li className="mt-auto border-t border-line py-3">
                      <Link
                        href={`/products?sector=${sector.key}`}
                        className="text-[0.9375rem] text-accent underline underline-offset-4"
                      >
                        {`All ${total} in ${sector.label}`}
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-raised text-ink transition-colors hover:border-ink disabled:cursor-default disabled:border-line disabled:text-muted disabled:opacity-40"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
