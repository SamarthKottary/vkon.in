"use client";

import Image from "next/image";
import { useRef } from "react";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { Badge } from "@/components/ui/Badge";
import { categoryLabel } from "@/content/taxonomy";
import { StoreProductPicker } from "@/app/admin/inventory/StoreProductPicker";
import { displayPricePaise, formatPaise, type GstRates } from "@/lib/pricing";
import type { Product, StoreProduct } from "@/lib/types";
import { storeAddProductsAction } from "./actions";

/**
 * What the store holds, as a plain list, with **Add products**.
 *
 * No edit, no delete, no reordering (client, 2026-09-26): the order is set on
 * the Stocks page where somebody is actually walking the shelves, the counts
 * are set there too, and taking a product off a store's list is the office's
 * call. Adding one is not — a store knows what it has started stocking before
 * anybody else does.
 */
export function StoreProducts({
  rows,
  products,
  rates,
}: {
  rows: StoreProduct[];
  products: Product[];
  rates: GstRates;
}) {
  const form = useRef<HTMLFormElement | null>(null);
  const field = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-4">
      <form action={storeAddProductsAction} ref={form}>
        <input type="hidden" name="productIds" ref={field} />
        <StoreProductPicker
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            category: product.category,
            image: product.images[0]?.url ?? null,
            price: product.price,
            discountPercent: product.discountPercent,
            published: product.published,
          }))}
          held={rows.map((row) => row.productId)}
          rates={rates}
          saveLabel="Save products"
          onSave={(ids) => {
            if (!field.current) return;
            field.current.value = ids.join(",");
            requestAnimationFrame(() => form.current?.requestSubmit());
          }}
        />
      </form>

      {rows.length === 0 ? (
        <div className="border border-line bg-surface px-6 py-12 text-center">
          <p className="text-ink">Nothing added yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-4 border border-line bg-surface p-4">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden border border-line bg-surface-subtle">
                {row.product.images[0] ? (
                  <Image
                    src={row.product.images[0].url}
                    alt=""
                    fill
                    sizes="3rem"
                    className="object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-muted">
                    <PanelPlaceholder className="h-4 w-4" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold leading-snug text-ink">{row.product.name}</p>
                  {row.product.outOfStock && <Badge tone="warn">Out of stock on site</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-muted">
                  {categoryLabel(row.product.category)}
                  {row.product.price != null &&
                    ` · ${formatPaise(displayPricePaise(row.product, rates))}`}
                </p>
              </div>
              <p className="shrink-0 whitespace-nowrap text-sm">
                <span className="label-tech text-muted">In stock </span>
                <span className="font-semibold tabular-nums text-ink">{row.qty}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
