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
import type { CategoryMeta, Product } from "@/lib/types";

/** Products listed inside an open card. Bounded so opening one does not shove
 *  the rest of the page a long way down; the card links on to the full list. */
const PANEL_LIMIT = 6;

export type CategoryGroup = { category: CategoryMeta; items: Product[] };

/**
 * The category browser on the home page.
 *
 * A horizontal track of category cards — three across on a wide screen, one
 * (with the next peeking) on a phone — that pages with the arrow buttons or by
 * ordinary scrolling. Clicking a card opens a panel beneath the row listing
 * that category's products by name.
 *
 * Notes worth keeping:
 *
 *  - **The panel belongs to its own card**, directly beneath it and the same
 *    width, so the products visibly belong to the category above them. The
 *    track is `items-start` so only the opened card grows; the others keep
 *    their height instead of stretching to match. The cards carry a
 *    `min-h` so they still look even while closed.
 *  - **Card widths are `calc` fractions of the container**, so exactly three
 *    land on a wide screen no matter how many categories exist. Adding a sixth
 *    category adds a card to scroll to; it does not shrink the other five.
 *  - **Arrows sit above the row, right-aligned, and disable at the ends**
 *    rather than disappearing, so the control never moves. They are hidden
 *    entirely when everything already fits, since a control that can never do
 *    anything is noise.
 *  - **Empty categories still get a card**, marked "Coming soon" and not
 *    expandable. They tell a visitor the range exists; a card that opened onto
 *    nothing would be a dead end.
 */
export function CategoryBrowser({ groups }: { groups: CategoryGroup[] }) {
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
            label="Previous categories"
            disabled={!canScroll.left}
            onClick={() => page(-1)}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </PageButton>
          <PageButton
            label="More categories"
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
        {groups.map(({ category, items }) => {
          const isOpen = openKey === category.key;

          return (
            <li
              key={category.key}
              className="w-[82%] flex-none snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`category-panel-${category.key}`}
                onClick={() => setOpenKey(isOpen ? null : category.key)}
                /* No dimmed state for empty categories. They are part of the
                   range and read as available; greying them made four of the
                   five look broken next to the one with stock. */
                className={`flex min-h-[19rem] w-full flex-col border bg-surface-raised p-6 text-left shadow-card transition-[box-shadow,border-color] duration-200 ${
                  isOpen
                    ? "border-accent shadow-card-hover"
                    : "border-line hover:border-line-strong hover:shadow-card-hover"
                }`}
              >
                <span /* 16:9, matching what the image generator actually offers. The
                       plate and the artwork share a ratio on purpose: with
                       `object-cover` any mismatch crops the flat-lay, and these
                       compositions are a centred group with little margin. */
                    className="relative -mx-6 -mt-6 mb-5 block aspect-video overflow-hidden border-b border-line bg-surface-subtle">
                  {category.image ? (
                    <Image
                      src={category.image}
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

                <h3 className="text-lg leading-snug">{category.label}</h3>
                {/* Clamped so every card is the same height. Unclamped, a
                    description that wraps to three lines on a phone where its
                    neighbour wraps to two makes the whole row taller for that
                    category — which moved everything below by 22px as you
                    switched between them. */}
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                  {category.description}
                </p>

                <span className="mt-auto flex items-center justify-between gap-4 pt-6">
                  <span className="label-tech text-muted">
                    {items.length === 0
                      ? "Coming soon"
                      : `${items.length} product${items.length === 1 ? "" : "s"}`}
                  </span>
                  <ChevronDownIcon
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-accent" : "text-muted"
                    }`}
                  />
                </span>
              </button>

              {/* The reserved space. This block is always in the layout at a
                  fixed height — six product rows plus the closing link — and
                  only gains a visible panel when the card is open. That is what
                  keeps the contact section still: opening or closing a card
                  fills or empties this box rather than growing the page. */}
              <div className="h-[21.5rem]">
                <ul
                  hidden={!isOpen}
                  id={`category-panel-${category.key}`}
                  /* Accent border, matching the open card above it: with the card
                     outlined in accent and the panel in the line token, the two
                     read as separate objects rather than one open card.

                     Fixed height, not auto: categories hold different numbers
                     of products, and letting the panel size to its contents
                     moved everything below by up to 287px as you switched
                     between them. At a fixed height the reserved space is the
                     same whichever card is open, so nothing below ever moves.
                     The bottom-anchored link is what stops a short list
                     looking like an unfinished box. */
                  className="flex h-full flex-col border border-t-0 border-accent bg-surface-subtle px-6 py-2"
                >
                  {items.slice(0, PANEL_LIMIT).map((product) => (
                    <li
                      key={product.id}
                      className="border-b border-line"
                    >
                      <Link
                        href={`/products/${product.slug}`}
                        className="group flex items-center justify-between gap-4 py-3 text-[0.9375rem] text-ink transition-colors hover:text-accent"
                      >
                        {product.name}
                        <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-accent" />
                      </Link>
                    </li>
                  ))}

                  {items.length === 0 && (
                    <li className="py-3 text-[0.9375rem] text-muted">
                      Nothing listed here yet — call us for what is available.
                    </li>
                  )}

                  <li className="mt-auto border-t border-line py-3">
                    <Link
                      href={`/products?category=${category.key}`}
                      className="text-[0.9375rem] text-accent underline underline-offset-4"
                    >
                      {items.length > PANEL_LIMIT
                        ? `All ${items.length} in ${category.label}`
                        : `Open ${category.label}`}
                    </Link>
                  </li>
                </ul>
              </div>
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
