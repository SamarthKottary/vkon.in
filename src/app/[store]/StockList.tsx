"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DragHandleIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/icons/ui";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { categoryLabel } from "@/content/taxonomy";
import { displayPricePaise, formatPaise, type GstRates } from "@/lib/pricing";
import type { StoreProduct } from "@/lib/types";
import { setStockAction, storeReorderAction } from "./actions";

/**
 * The shelves: a row per product, in the order they are walked past, with the
 * count and the two buttons that change it (client, 2026-09-26).
 *
 * **The count changes optimistically and saves behind it.** Somebody counting a
 * shelf presses `+` a dozen times in a row; waiting for a round trip between
 * presses would make it unusable, and a box that lags behind the fingers gets
 * pressed twice. Each press updates the number on screen at once and fires the
 * action in a transition; the server clamps at zero and is the final word.
 *
 * Typing straight into the box is the other way in — for a shelf somebody has
 * already counted — and it saves when the box loses focus or on Enter, not on
 * every keystroke.
 */
export function StockList({
  rows,
  rates,
  slug,
}: {
  rows: StoreProduct[];
  rates: GstRates;
  slug: string;
}) {
  const [items, setItems] = useState(rows);
  const [q, setQ] = useState("");
  const [, startTransition] = useTransition();
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  /* The server is the truth: a save, a reorder or another till's change comes
     back as new props, and the list takes them.

     Adjusted during render rather than in an effect — React's own pattern for
     state that follows a prop, and the one §9 of ARCHITECTURE.md requires: a
     `setState` in an effect body renders the stale list first and the right one
     a frame later, which on this page is a count visibly jumping back. */
  const [lastRows, setLastRows] = useState(rows);
  if (lastRows !== rows) {
    setLastRows(rows);
    setItems(rows);
  }

  const term = q.trim().toLowerCase();
  const shown = term
    ? items.filter(
        (row) =>
          row.product.name.toLowerCase().includes(term) ||
          categoryLabel(row.product.category).toLowerCase().includes(term),
      )
    : items;
  /* Dragging a filtered list would renumber the rows hidden behind the search;
     the admin list has the same rule for the same reason. */
  const sortable = !term;

  function setQty(id: string, qty: number) {
    setItems((current) =>
      current.map((row) => (row.id === id ? { ...row, qty: Math.max(0, qty) } : row)),
    );
  }

  function step(row: StoreProduct, by: number) {
    if (row.qty + by < 0) return;
    setQty(row.id, row.qty + by);
    const data = new FormData();
    data.set("id", row.id);
    data.set("by", String(by));
    startTransition(() => {
      setStockAction(data);
    });
  }

  function commitExact(row: StoreProduct, raw: string) {
    const value = Math.max(0, Math.floor(Number(raw.replace(/[^\d]/g, "")) || 0));
    if (value === row.qty) return;
    setQty(row.id, value);
    const data = new FormData();
    data.set("id", row.id);
    data.set("to", String(value));
    startTransition(() => {
      setStockAction(data);
    });
  }

  function move(from: number, to: number) {
    if (!sortable || to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setItems(next);
    startTransition(() => {
      storeReorderAction(next.map((one) => one.id));
    });
  }

  if (items.length === 0) {
    return (
      <div className="border border-line bg-surface px-6 py-16 text-center">
        <p className="text-ink">This store holds nothing yet.</p>
        <p className="mt-1 text-sm text-muted">
          Add products from{" "}
          <a href={`/${slug}/profile`} className="text-accent hover:underline">
            this store&rsquo;s details
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full sm:w-80">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search these shelves"
          aria-label="Search these shelves"
          className="h-10 w-full border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        />
      </div>

      {shown.length === 0 ? (
        <div className="border border-line bg-surface px-6 py-12 text-center">
          <p className="text-ink">Nothing here matches “{q}”.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((row, index) => (
            <li
              key={row.id}
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
              className={`border bg-surface p-3 sm:p-4 ${
                overIndex === index ? "border-accent" : "border-line"
              }`}
            >
              <div className="flex items-center gap-3 sm:gap-4">
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
                    <DragHandleIcon className="hidden h-4 w-4 cursor-grab text-muted sm:block" />
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

                <div className="relative hidden h-14 w-14 shrink-0 overflow-hidden border border-line bg-surface-subtle sm:block">
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
                  <p className="text-sm font-semibold leading-snug text-ink">{row.product.name}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {categoryLabel(row.product.category)}
                    {row.product.price != null &&
                      ` · ${formatPaise(displayPricePaise(row.product, rates))}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                  <p className="hidden whitespace-nowrap sm:block">
                    <span className="label-tech text-muted">In stock </span>
                    <span className="text-base font-semibold tabular-nums text-ink">{row.qty}</span>
                  </p>

                  <QtyBox row={row} onCommit={commitExact} />

                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => step(row, 1)}
                      aria-label={`One more ${row.product.name}`}
                      className="inline-flex h-10 w-10 items-center justify-center border border-line-strong text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => step(row, -1)}
                      disabled={row.qty === 0}
                      aria-label={`One fewer ${row.product.name}`}
                      className="-ml-px inline-flex h-10 w-10 items-center justify-center border border-line-strong text-ink transition-colors hover:border-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <MinusIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The number box, which follows the row until somebody types in it.
 *
 * Its own state, so `+` and `−` keep it current while a half-typed number is
 * left alone: a controlled input tied straight to the row would erase what
 * somebody was in the middle of typing the moment a save came back.
 */
function QtyBox({
  row,
  onCommit,
}: {
  row: StoreProduct;
  onCommit: (row: StoreProduct, raw: string) => void;
}) {
  const [text, setText] = useState(String(row.qty));
  const [typing, setTyping] = useState(false);
  const [lastQty, setLastQty] = useState(row.qty);

  /* Follows the row unless somebody is typing in it — during render, for the
     same reason the list does. */
  if (!typing && lastQty !== row.qty) {
    setLastQty(row.qty);
    setText(String(row.qty));
  }

  return (
    <input
      value={text}
      inputMode="numeric"
      aria-label={`How many ${row.product.name}`}
      onFocus={() => setTyping(true)}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        setTyping(false);
        onCommit(row, text);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="h-10 w-16 border border-line-strong bg-surface px-2 text-center text-sm tabular-nums text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
    />
  );
}
