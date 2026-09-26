"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, CloseIcon, SearchIcon } from "@/components/icons/ui";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { categoryLabel } from "@/content/taxonomy";
import { displayPricePaise, formatPaise, type GstRates } from "@/lib/pricing";

export type PickerProduct = {
  id: string;
  name: string;
  category: string;
  image: string | null;
  /** The M.R.P. in whole rupees, as `products.price` stores it. */
  price: number | null;
  discountPercent: number | null;
  published: boolean;
};

/**
 * **Add products** — the catalogue as cards, to choose what a store holds
 * (client, 2026-09-26: "pop up products same like all products page where
 * cards are shown").
 *
 * A dialog rather than another page: choosing what a store stocks is one step
 * of filling the store in, and leaving the half-typed address behind to go and
 * pick products is how a form gets lost.
 *
 * **Products already held are shown, ticked and unpickable.** The alternative
 * — hiding them — leaves somebody hunting for a product that is already on the
 * shelf, and finding nothing is indistinguishable from a broken search.
 *
 * What "save" does is the caller's business: on a new store it submits the
 * whole form, on a store that exists it posts the additions. This component
 * knows only which ids were ticked.
 */
export function StoreProductPicker({
  products,
  held = [],
  rates,
  saveLabel = "Save products",
  onSave,
  disabled,
}: {
  products: PickerProduct[];
  /** Product ids the store already holds. */
  held?: string[];
  /** The shop's CGST/SGST, so a card here says what a card on the site says. */
  rates: GstRates;
  saveLabel?: string;
  onSave: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const dialog = useRef<HTMLDivElement | null>(null);
  const alreadyHeld = new Set(held);

  /* Escape closes it, and the body stops scrolling behind it — the same
     manners as the site's own quick view. Both are external state, so they
     belong in an effect and are undone when it closes. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const term = q.trim().toLowerCase();
  const shown = term
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          categoryLabel(p.category).toLowerCase().includes(term),
      )
    : products;

  const toggle = (id: string) => {
    if (alreadyHeld.has(id)) return;
    setPicked((current) =>
      current.includes(id) ? current.filter((one) => one !== id) : [...current, id],
    );
  };

  const save = () => {
    setOpen(false);
    onSave(picked);
    setPicked([]);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex h-10 items-center gap-2 border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add products
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Add products to this store"
            tabIndex={-1}
            className="flex max-h-[92vh] w-full max-w-4xl flex-col border border-line bg-surface shadow-card outline-none"
          >
            <div className="flex items-center gap-3 border-b border-line p-4">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Search the catalogue"
                  aria-label="Search the catalogue"
                  autoFocus
                  className="h-10 w-full border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-line-strong text-ink transition-colors hover:border-ink"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {shown.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted">
                  Nothing in the catalogue matches “{q}”.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {shown.map((product) => {
                    const isHeld = alreadyHeld.has(product.id);
                    const isPicked = picked.includes(product.id);
                    return (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => toggle(product.id)}
                          aria-pressed={isPicked || isHeld}
                          disabled={isHeld}
                          className={`relative flex h-full w-full flex-col border p-3 text-left transition-colors ${
                            isHeld
                              ? "cursor-not-allowed border-line bg-surface-subtle opacity-70"
                              : isPicked
                                ? "border-accent bg-accent-soft"
                                : "border-line bg-surface hover:border-ink"
                          }`}
                        >
                          <span className="relative mb-2 block aspect-square w-full overflow-hidden border border-line bg-surface-subtle">
                            {product.image ? (
                              <Image
                                src={product.image}
                                alt=""
                                fill
                                sizes="(min-width: 1024px) 12rem, 40vw"
                                className="object-cover"
                              />
                            ) : (
                              <span className="absolute inset-0 flex items-center justify-center text-muted">
                                <PanelPlaceholder className="h-7 w-7" />
                              </span>
                            )}
                            {(isPicked || isHeld) && (
                              <span className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center bg-accent text-surface">
                                <CheckIcon className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </span>
                          <span className="label-tech text-muted">
                            {categoryLabel(product.category)}
                          </span>
                          <span className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-ink">
                            {product.name}
                          </span>
                          {/* The price the site shows: the discount taken off
                              the M.R.P. and tax added, not the raw column
                              (client, 2026-09-26: "why are the product prices
                              different"). `products.price` is whole rupees. */}
                          <span className="mt-1 text-sm tabular-nums text-body">
                            {product.price == null
                              ? "No price"
                              : formatPaise(
                                  displayPricePaise(
                                    { price: product.price, discountPercent: product.discountPercent } as never,
                                    rates,
                                  ),
                                )}
                          </span>
                          {isHeld && (
                            <span className="mt-1 text-xs text-muted">Already in this store</span>
                          )}
                          {!product.published && (
                            <span className="mt-1 text-xs text-muted">Not published</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line p-4">
              <p className="text-sm text-muted">
                {picked.length === 0
                  ? "Nothing chosen yet"
                  : `${picked.length} product${picked.length === 1 ? "" : "s"} chosen`}
              </p>
              <button
                type="button"
                onClick={save}
                disabled={picked.length === 0}
                className="inline-flex h-10 items-center gap-2 border border-accent bg-accent px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saveLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
