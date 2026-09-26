"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DragHandleIcon,
  EyeIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/icons/ui";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { Badge } from "@/components/ui/Badge";
import { categoryLabel } from "@/content/taxonomy";
import { productHref } from "@/lib/product-url";
import { displayPricePaise, formatPaise, type GstRates } from "@/lib/pricing";
import type { StoreProduct } from "@/lib/types";
import {
  removeStoreProductAction,
  reorderStoreProductsAction,
  setStoreStockAction,
} from "../actions";

/**
 * What a store holds: the same list as the admin catalogue, doing the same
 * four things (client, 2026-09-26: "this will be like products page in admin
 * where he can move the products up or down, edit, view, delete").
 *
 * **Edit is the quantity, not the product.** The product belongs to the
 * catalogue and is edited there; what changes per store is how many of it are
 * on that shelf and anything worth noting about them — which is the whole
 * point of an inventory. View opens the product's own page on the site.
 *
 * Reordering is optimistic and saved in a transition, exactly as
 * `ProductReorder` does it, with the up/down buttons carrying whatever a mouse
 * drag cannot.
 */
export function StoreStockList({
  storeId,
  rows,
  rates,
  frozen,
}: {
  storeId: string;
  rows: StoreProduct[];
  /** The shop's CGST/SGST, so a row says what the product's own page says. */
  rates: GstRates;
  /** A blocked store is read-only — the server refuses the writes too. */
  frozen?: boolean;
}) {
  const [items, setItems] = useState(rows);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [isPending, startTransition] = useTransition();
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  /* **Reordering is off while a search is showing** (client, 2026-09-26 asked
     for the search; the rule is `ProductReorder`'s, and it is the same trap):
     a filtered list would send only the rows on screen, and the ones hidden
     behind the search would be renumbered around them. */
  const term = q.trim().toLowerCase();
  const shown = term
    ? items.filter(
        (row) =>
          row.product.name.toLowerCase().includes(term) ||
          categoryLabel(row.product.category).toLowerCase().includes(term) ||
          row.note.toLowerCase().includes(term),
      )
    : items;
  const sortable = !frozen && !term;

  function commit(next: StoreProduct[]) {
    setItems(next);
    startTransition(() => {
      reorderStoreProductsAction(storeId, next.map((row) => row.id));
    });
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    commit(next);
  }

  if (items.length === 0) {
    return (
      <div className="border border-line bg-surface px-6 py-16 text-center">
        <p className="text-ink">This store holds nothing yet.</p>
        <p className="mt-1 text-sm text-muted">
          Add products to say what is on its shelves.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search what this store holds"
            aria-label="Search what this store holds"
            className="h-10 w-full border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </div>
        {term && (
          <p className="text-sm text-muted">
            {shown.length} of {items.length} · order is locked while searching
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="border border-line bg-surface px-6 py-12 text-center">
          <p className="text-ink">Nothing here matches “{q}”.</p>
          <button
            type="button"
            onClick={() => setQ("")}
            className="mt-2 text-sm text-accent hover:underline"
          >
            Show everything
          </button>
        </div>
      ) : (
    <ul className={`space-y-2 ${isPending ? "opacity-70" : ""}`}>
      {shown.map((row, index) => (
        <li
          key={row.id}
          id={`row-${row.id}`}
          draggable={sortable}
          onDragStart={() => {
            dragIndex.current = index;
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setOverIndex(index);
          }}
          onDragEnd={() => {
            dragIndex.current = null;
            setOverIndex(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            const from = dragIndex.current;
            dragIndex.current = null;
            setOverIndex(null);
            if (from !== null) move(from, index);
          }}
          className={`scroll-mt-24 border bg-surface p-4 ${
            overIndex === index ? "border-accent" : "border-line"
          }`}
        >
          <div className="flex items-start gap-3 sm:items-center sm:gap-4">
            {sortable && (
              <div className="flex shrink-0 flex-col items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move ${row.product.name} up`}
                  className="text-muted transition-colors hover:text-ink disabled:opacity-30"
                >
                  <ArrowUpIcon className="h-4 w-4" />
                </button>
                <DragHandleIcon className="h-4 w-4 cursor-grab text-muted" />
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === shown.length - 1}
                  aria-label={`Move ${row.product.name} down`}
                  className="text-muted transition-colors hover:text-ink disabled:opacity-30"
                >
                  <ArrowDownIcon className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="relative h-14 w-14 shrink-0 overflow-hidden border border-line bg-surface-subtle">
              {row.product.images[0] ? (
                <Image
                  src={row.product.images[0].url}
                  alt=""
                  fill
                  sizes="3.5rem"
                  className="object-cover"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-muted">
                  <PanelPlaceholder className="h-5 w-5" />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold leading-snug text-ink">{row.product.name}</p>
                {!row.product.published && <Badge>Unpublished</Badge>}
                {row.product.outOfStock && <Badge tone="warn">Out of stock on site</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-muted">
                {categoryLabel(row.product.category)}
                {row.product.price != null &&
                  ` · ${formatPaise(displayPricePaise(row.product, rates))}`}
              </p>
              {row.note && <p className="mt-1 text-sm text-body">{row.note}</p>}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
              <p className="whitespace-nowrap text-sm tabular-nums text-ink">
                <span className="label-tech text-muted">In stock </span>
                <span className="font-semibold">{row.qty}</span>
              </p>

              {!frozen && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(editing === row.id ? null : row.id)}
                    aria-expanded={editing === row.id}
                    className="inline-flex h-9 items-center gap-1.5 px-2 text-sm font-medium text-ink transition-colors hover:text-accent"
                  >
                    <PencilIcon className="h-[1.1rem] w-[1.1rem]" />
                    Edit
                    <span className="sr-only"> the stock of {row.product.name}</span>
                  </button>

                  <Link
                    href={productHref(row.product)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 px-2 text-sm font-medium text-ink transition-colors hover:text-accent"
                  >
                    <EyeIcon className="h-[1.1rem] w-[1.1rem]" />
                    View
                    <span className="sr-only"> {row.product.name}</span>
                  </Link>

                  <form action={removeStoreProductAction}>
                    <input type="hidden" name="storeId" value={storeId} />
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      aria-label={`Remove ${row.product.name} from this store`}
                      title="Remove from this store"
                      className="inline-flex h-9 items-center px-2 text-red-600 transition-colors hover:text-red-700"
                    >
                      <TrashIcon className="h-[1.1rem] w-[1.1rem]" />
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>

          {editing === row.id && !frozen && (
            <form
              action={setStoreStockAction}
              className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3"
            >
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="id" value={row.id} />
              <div>
                <label htmlFor={`qty-${row.id}`} className="label-tech block text-muted">
                  In stock
                </label>
                <input
                  id={`qty-${row.id}`}
                  name="qty"
                  defaultValue={row.qty}
                  inputMode="numeric"
                  autoFocus
                  className="mt-1.5 h-10 w-28 border border-line-strong bg-surface px-3 text-sm tabular-nums text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor={`note-${row.id}`} className="label-tech block text-muted">
                  Note
                </label>
                <input
                  id={`note-${row.id}`}
                  name="note"
                  defaultValue={row.note}
                  placeholder="Where it is kept, a batch, anything worth saying"
                  className="mt-1.5 h-10 w-full border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                />
              </div>
              <button
                type="submit"
                className="inline-flex h-10 items-center border border-accent bg-accent px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent-strong"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-10 px-2 text-sm text-muted transition-colors hover:text-ink"
              >
                Cancel
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
      )}
    </div>
  );
}
