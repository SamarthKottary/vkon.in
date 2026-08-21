"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DragHandleIcon,
  PencilIcon,
} from "@/components/icons/ui";
import { Badge } from "@/components/ui/Badge";
import { categoryLabel } from "@/content/taxonomy";
import type { Product } from "@/lib/types";
import { reorderProductsAction } from "../actions";
import { DeleteProductButton } from "./DeleteProductButton";

/**
 * The product list, reorderable by dragging a row (or, for anyone without a
 * mouse — keyboard, touch, screen reader — the up/down buttons beside the
 * handle, which move the same one row and save the same way).
 *
 * State here is the order, optimistic: a drop reorders `items` immediately
 * and fires `reorderProductsAction` in a transition, rather than waiting on
 * the server before showing the new order. `sort_order` is otherwise only
 * ever read, never typed by hand — see the note on `ProductForm` for why a
 * number field for it was removed. A new product is never handled here at
 * all: it is appended after the last row by `nextSortOrder()` at creation, so
 * there is always a stable "end" to drag it up from.
 *
 * Native HTML5 drag-and-drop (`draggable`, not a library — see AGENTS.md on
 * dependencies) rather than a pointer-events reimplementation: this is a
 * single-axis, single-list reorder, exactly what the browser's own drag
 * source/drop target model is for.
 */
export function ProductReorder({ products }: { products: Product[] }) {
  const [items, setItems] = useState(products);
  const [isPending, startTransition] = useTransition();
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function commit(next: Product[]) {
    setItems(next);
    startTransition(() => {
      reorderProductsAction(next.map((p) => p.id));
    });
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
  }

  return (
    <ul aria-busy={isPending}>
      {items.map((product, index) => (
        <li
          key={product.id}
          draggable
          onDragStart={() => {
            dragIndex.current = index;
          }}
          onDragEnter={() => setOverIndex(index)}
          onDragOver={(event) => event.preventDefault()}
          onDragEnd={() => {
            dragIndex.current = null;
            setOverIndex(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            const from = dragIndex.current;
            dragIndex.current = null;
            setOverIndex(null);
            if (from === null || from === index) return;
            move(from, index);
          }}
          className={`flex flex-wrap items-center gap-4 border-b border-line bg-surface p-4 last:border-b-0 sm:flex-nowrap ${
            overIndex === index ? "bg-surface-subtle" : ""
          }`}
        >
          <div className="flex shrink-0 flex-col items-center gap-1 self-stretch justify-center text-muted">
            <button
              type="button"
              onClick={() => move(index, index - 1)}
              disabled={index === 0}
              aria-label={`Move ${product.name} up`}
              className="p-0.5 hover:text-ink disabled:cursor-default disabled:opacity-30"
            >
              <ArrowUpIcon className="h-3.5 w-3.5" />
            </button>
            <span
              aria-hidden
              title="Drag to reorder"
              className="cursor-grab text-muted active:cursor-grabbing"
            >
              <DragHandleIcon className="h-4 w-4" />
            </span>
            <button
              type="button"
              onClick={() => move(index, index + 1)}
              disabled={index === items.length - 1}
              aria-label={`Move ${product.name} down`}
              className="p-0.5 hover:text-ink disabled:cursor-default disabled:opacity-30"
            >
              <ArrowDownIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="relative h-14 w-14 shrink-0 border border-line bg-surface-subtle">
            {product.images[0] ? (
              <Image
                src={product.images[0].url}
                alt=""
                fill
                sizes="3.5rem"
                className="object-contain p-1"
              />
            ) : (
              <span className="label-tech flex h-full w-full items-center justify-center text-muted">
                —
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/products/${product.id}`}
                className="truncate font-medium text-ink hover:text-accent"
              >
                {product.name}
              </Link>
              {!product.published && <Badge tone="warn">Draft</Badge>}
              {product.featured && <Badge tone="brand">Featured</Badge>}
            </div>
            <p className="label-tech mt-1.5 truncate text-muted">
              {categoryLabel(product.category)} · /{product.slug}
              {product.videoUrl ? " · video" : ""}
              {product.images.length
                ? ` · ${product.images.length} image${product.images.length === 1 ? "" : "s"}`
                : ""}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {product.published && (
              <Link
                href={`/products/${product.slug}`}
                target="_blank"
                className="px-3 py-2 text-sm text-muted hover:text-ink"
              >
                View
              </Link>
            )}
            <Link
              href={`/admin/products/${product.id}`}
              className="inline-flex items-center gap-1.5 border border-line-strong px-3 py-2 text-sm text-ink hover:border-ink"
            >
              <PencilIcon className="h-3.5 w-3.5" />
              Edit
            </Link>
            <DeleteProductButton id={product.id} name={product.name} />
          </div>
        </li>
      ))}
    </ul>
  );
}
