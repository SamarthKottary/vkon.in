"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, CloseIcon, PlusIcon, SearchIcon } from "@/components/icons/ui";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { categories, categoryLabel } from "@/content/taxonomy";
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
  initialPicked = [],
  saveLabel = "Save products",
  onSave,
  disabled,
}: {
  products: PickerProduct[];
  /** Product ids the store already holds. */
  held?: string[];
  /** The shop's CGST/SGST, so a card here says what a card on the site says. */
  rates: GstRates;
  /** Ids already picked — restores state when the dialog re-opens. */
  initialPicked?: string[];
  saveLabel?: string;
  onSave: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(initialPicked ?? []);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
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

  useEffect(() => {
    if (!open) {
      setPicked(initialPicked ?? []);
    }
  }, [open, initialPicked]);

  /* Which category keys actually appear in the catalogue being shown. */
  const presentCats = Array.from(new Set(products.map((p) => p.category)));
  const catChips = categories.filter((c) => presentCats.includes(c.key));

  const term = q.trim().toLowerCase();
  const shown = products.filter((p) => {
    const matchCat = catFilter === "all" || p.category === catFilter;
    const matchQ =
      !term ||
      p.name.toLowerCase().includes(term) ||
      categoryLabel(p.category).toLowerCase().includes(term);
    return matchCat && matchQ;
  });

  const toggle = (id: string) => {
    if (alreadyHeld.has(id)) return;
    setPicked((current) =>
      current.includes(id) ? current.filter((one) => one !== id) : [...current, id],
    );
  };

  const save = () => {
    setOpen(false);
    onSave(picked);
  };

  const close = () => setOpen(false);

  /* Newly-chosen products (not already held). */
  const newCount = picked.filter((id) => !alreadyHeld.has(id)).length;

  return (
    <>
      {/* Trigger button — accent-filled and shows count when something is picked */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={`inline-flex h-10 items-center gap-2 border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          newCount > 0
            ? "border-accent bg-accent text-surface hover:bg-accent-strong"
            : "border-line-strong bg-surface text-ink hover:border-ink hover:bg-surface-subtle"
        }`}
      >
        <PlusIcon className="h-4 w-4" />
        {newCount > 0 ? `${newCount} product${newCount === 1 ? "" : "s"} selected` : "Add products"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Add products to this store"
            tabIndex={-1}
            className="flex max-h-[96vh] w-full max-w-5xl flex-col border border-line bg-surface shadow-card outline-none sm:max-h-[88vh]"
          >
            {/* Header: title + search + close */}
            <div className="flex shrink-0 items-center gap-3 border-b border-line p-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-ink">Add products</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {products.length} product{products.length === 1 ? "" : "s"} in catalogue
                </p>
              </div>
              <div className="relative w-52 shrink-0">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Search…"
                  aria-label="Search the catalogue"
                  autoFocus
                  className="h-9 w-full border border-line-strong bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                />
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-line-strong text-ink transition-colors hover:border-ink"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            {/* Category filter chips */}
            {catChips.length > 1 && (
              <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-line px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setCatFilter("all")}
                  className={`inline-flex h-7 shrink-0 items-center rounded-full px-3 text-xs font-medium transition-colors ${
                    catFilter === "all"
                      ? "bg-ink text-surface"
                      : "bg-surface-subtle text-body hover:bg-surface-raised hover:text-ink"
                  }`}
                >
                  All
                </button>
                {catChips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCatFilter(catFilter === c.key ? "all" : c.key)}
                    className={`inline-flex h-7 shrink-0 items-center rounded-full px-3 text-xs font-medium transition-colors ${
                      catFilter === c.key
                        ? "bg-ink text-surface"
                        : "bg-surface-subtle text-body hover:bg-surface-raised hover:text-ink"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {shown.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted">
                  {q || catFilter !== 'all' ? 'Nothing matches your filter.' : 'No products in the catalogue.'}
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
                                sizes="(min-width: 1280px) 10rem, (min-width: 1024px) 12rem, 40vw"
                                className="object-cover"
                              />
                            ) : (
                              <span className="absolute inset-0 flex items-center justify-center text-muted">
                                <PanelPlaceholder className="h-6 w-6" />
                              </span>
                            )}
                            {(isPicked || isHeld) && (
                              <span className={`absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center ${isHeld ? "bg-muted" : "bg-accent"} text-surface`}>
                                <CheckIcon className="h-3 w-3" />
                              </span>
                            )}
                          </span>
                          <span className="label-tech text-[10px] text-muted">
                            {categoryLabel(product.category)}
                          </span>
                          <span className="mt-0.5 line-clamp-2 text-xs font-semibold leading-snug text-ink">
                            {product.name}
                          </span>
                          {/* The price the site shows: the discount taken off
                              the M.R.P. and tax added, not the raw column
                              (client, 2026-09-26: "why are the product prices
                              different"). `products.price` is whole rupees. */}
                          <span className="mt-1 text-xs tabular-nums text-body">
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
                            <span className="mt-1 text-[10px] text-muted">In store</span>
                          )}
                          {!product.published && !isHeld && (
                            <span className="mt-1 text-[10px] text-muted">Unpublished</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p className="text-sm text-muted">
                {newCount === 0
                  ? held.length > 0
                    ? `${held.length} already in store`
                    : "Nothing chosen yet"
                  : `${newCount} product${newCount === 1 ? "" : "s"} to add`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-9 items-center px-4 text-sm text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={newCount === 0}
                  className="inline-flex h-9 items-center gap-2 border border-accent bg-accent px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                  {saveLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
