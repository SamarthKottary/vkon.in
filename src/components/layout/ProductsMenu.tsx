"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
} from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";

export type MenuSector = {
  key: string;
  label: string;
  /** `count` decides whether the row links; it is not displayed. */
  categories: { key: string; label: string; count: number }[];
};

/**
 * The "Products" dropdown in the header.
 *
 * A full-width panel under the header, one column per market, listing that
 * market's categories — and a link to the whole catalogue.
 *
 * Category names only. It briefly carried a product count beside each; a menu
 * is for getting somewhere, and a number that changes whenever a product is
 * saved is noise in a list of seven links. The count is still passed in,
 * because whether a category has anything in it decides whether its row is a
 * link at all.
 *
 * **Categories only, not product names.** It listed every product under its
 * category until 2026-08-18; with seven categories that was a wall of names
 * doing the catalogue's job badly, and it grew every time a product was added.
 * The menu's job is to say what the range covers and get you to the right
 * filtered view. A category with nothing in it is still listed, because that is
 * part of saying what the range covers — but it is not a link, since the
 * catalogue only offers filters that have products behind them.
 *
 * Behaviour worth keeping:
 *  - **Escape closes it and returns focus to the trigger.** Losing focus into a
 *    closed panel strands a keyboard user at the top of the document.
 *  - **A click outside closes it**, via a pointerdown listener on the document
 *    that ignores clicks inside the panel or on the trigger.
 *  - **It closes on navigation.** The panel is not unmounted by a route change
 *    on its own, so following a link would otherwise leave it hanging open over
 *    the new page.
 *  - **The slider self-hides.** Three markets fit on any desktop, so the arrows
 *    are invisible today; they exist so a fourth adds a column to scroll to
 *    rather than a second row. See the note on the track.
 */
export function ProductsMenu({
  menu,
  open,
  onToggle,
  onClose,
  active,
}: {
  menu: MenuSector[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  active: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
  }, []);

  /* Measured when the panel opens, not on mount: the track has no width until
     it is rendered, so a mount-time measurement would always say "fits". */
  useEffect(() => {
    if (!open) return;
    sync();
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, sync]);

  const page = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 40 : el.clientWidth;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        triggerRef.current?.focus();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  /* With no catalogue to show — the root 404 renders the header outside the
     route group that loads it — this degrades to the plain link it replaced,
     rather than a button that opens an empty panel. */
  if (menu.length === 0) {
    return (
      <Link
        href="/products"
        aria-current={active ? "page" : undefined}
        className={`relative flex h-16 items-center px-4 text-sm font-medium transition-colors ${
          active
            ? "text-ink after:absolute after:inset-x-4 after:bottom-0 after:h-[2px] after:bg-accent"
            : "text-muted hover:text-ink"
        }`}
      >
        Products
      </Link>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="products-menu"
        onClick={onToggle}
        className={`relative flex h-16 items-center gap-1.5 px-4 text-sm font-medium transition-colors ${
          active || open
            ? "text-ink after:absolute after:inset-x-4 after:bottom-0 after:h-[2px] after:bg-accent"
            : "text-muted hover:text-ink"
        }`}
      >
        Products
        <ChevronDownIcon
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          id="products-menu"
          className="absolute inset-x-0 top-full border-b border-line bg-surface-raised shadow-card-hover"
        >
          <Container size="wide">
            {(canScroll.left || canScroll.right) && (
              <div className="flex items-center justify-end gap-2 pt-6">
                <SlideButton
                  label="Previous categories"
                  disabled={!canScroll.left}
                  onClick={() => page(-1)}
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                </SlideButton>
                <SlideButton
                  label="More categories"
                  disabled={!canScroll.right}
                  onClick={() => page(1)}
                >
                  <ArrowRightIcon className="h-4 w-4" />
                </SlideButton>
              </div>
            )}

            {/* One row, always. A wrapping grid pushed the last column onto a
                second line under the first, which read as if it belonged to it.
                Fixed-width columns in a scroller keep every market a sibling;
                a fourth adds a column to scroll to rather than a second row. */}
            <div
              ref={trackRef}
              onScroll={sync}
              className="hscroll flex snap-x gap-10 overflow-x-auto pb-10 pt-7"
            >
              {menu.map((sector) => (
                <div
                  key={sector.key}
                  className="w-64 flex-none snap-start sm:w-72"
                >
                  <Link
                    href={`/products?sector=${sector.key}`}
                    onClick={onClose}
                    className="label-tech text-accent hover:underline"
                  >
                    {sector.label}
                  </Link>

                  <ul className="mt-4 space-y-3">
                    {sector.categories.map((category) => (
                      <li key={category.key}>
                        {category.count > 0 ? (
                          <Link
                            href={`/products?category=${category.key}`}
                            onClick={onClose}
                            className="block text-[0.9375rem] text-ink hover:text-accent"
                          >
                            {category.label}
                          </Link>
                        ) : (
                          <p className="flex items-baseline gap-2 text-[0.9375rem] text-muted">
                            {category.label}
                            <span className="label-tech">Coming soon</span>
                          </p>
                        )}
                      </li>
                    ))}

                    {sector.categories.length === 0 && (
                      <li className="label-tech text-muted">Coming soon</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>

            <div className="border-t border-line py-5">
              <Link href="/products" onClick={onClose} className="link-cta">
                All products
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </Container>
        </div>
      )}
    </>
  );
}

function SlideButton({
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
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-ink disabled:cursor-default disabled:text-muted disabled:opacity-40"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
