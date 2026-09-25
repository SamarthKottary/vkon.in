"use client";

import { productSku } from "@/lib/sku";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRightIcon, TrashIcon } from "@/components/icons/ui";
import { QuantityStepper } from "@/components/cart/QuantityStepper";
import { useCartLines } from "@/components/cart/useCart";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { removeFromCart } from "@/lib/cart";
import { useGst } from "@/components/pricing/GstProvider";
import { formatPaise, sellingPricePaise, totals, withGst } from "@/lib/pricing";
import type { Product } from "@/lib/types";

/**
 * Full Cart Page component:
 * - Left column: Item table with image, name, SKU, price, quantity, subtotal (no front X column).
 * - Right column: CART TOTALS with Subtotal, Shipping, CGST 9%, SGST 9%, and Total using website accent green.
 */
export function CartList({ products }: { products: Product[] }) {
  const lines = useCartLines();

  /* Paise, and through `lib/pricing`, like every other total on the site
     (2026-09-25): this used to keep its own rupee arithmetic with 9% written
     into it, which is two implementations of one sum and a rate the admin
     could no longer change. The prices shown are tax-inclusive, as they are on
     the product pages; the summary takes them apart again. */
  const rates = useGst();
  const resolved = useMemo(() => {
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    return (lines ?? [])
      .map((line) => {
        const product = bySlug.get(line.slug);
        if (!product) return null;

        const base = sellingPricePaise(product);
        return {
          line,
          product,
          /** The taxable base, which is what an order stores. */
          lineBase: base * line.qty,
          sellingPrice: withGst(base, rates),
          totalPrice: withGst(base * line.qty, rates),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [lines, products, rates]);

  const money = useMemo(
    () => totals(resolved.map((item) => ({ lineTotal: item.lineBase })), 0, rates),
    [resolved, rates],
  );
  const { subtotal, cgst, sgst } = money;
  const grandTotal = money.total;

  // Pre-hydration check
  if (lines === null) return null;

  if (resolved.length === 0) {
    return (
      <div className="border border-line bg-surface-raised px-6 py-20 text-center shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-subtle text-muted">
          <PanelPlaceholder className="h-7 w-7" />
        </span>
        <p className="mt-5 text-lg font-bold text-ink">Your cart is empty</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Add motor starters or panels from the catalogue to calculate your tax and totals.
        </p>
        <Link
          href="/products"
          className="mt-7 inline-flex h-11 items-center justify-center gap-2 bg-accent hover:bg-accent-strong px-6 text-sm font-bold text-surface uppercase tracking-wider transition-colors shadow-sm"
        >
          Browse products
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-12">
      {/* Left Column: Product Table + Actions */}
      <div className="space-y-6">
        {/* Mobile View: Card List (< sm) */}
        <div className="space-y-4 sm:hidden">
          {resolved.map(({ line, product, sellingPrice, totalPrice }) => {
            const image = product.images[0];
            const skuCode = productSku(product);

            return (
              <div
                key={product.slug}
                className="border border-line bg-surface p-4 shadow-card"
              >
                <div className="flex gap-3.5">
                  <Link
                    href={`/products/${product.slug}`}
                    className="relative h-20 w-20 shrink-0 overflow-hidden border border-line bg-surface-subtle"
                  >
                    {image ? (
                      <Image
                        src={image.url}
                        alt={image.alt || product.name}
                        fill
                        sizes="5rem"
                        className="object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-muted">
                        <PanelPlaceholder className="h-6 w-6" />
                      </span>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/products/${product.slug}`}
                        className="font-semibold text-ink hover:text-accent transition-colors leading-snug line-clamp-2 text-sm"
                      >
                        {product.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeFromCart(product.slug)}
                        aria-label={`Remove ${product.name} from cart`}
                        className="shrink-0 p-1 text-muted hover:text-red-600 hover:bg-red-500/10 rounded transition-colors"
                        title="Remove item"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-muted font-mono uppercase tracking-wide">
                      SKU: {skuCode}
                    </p>
                    {/* Out of stock while it sits in the basket (client,
                        2026-09-22): said here, refused at checkout. */}
                    {product.outOfStock && (
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-price-off">
                        Out of stock — remove to order the rest
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      Unit: <span className="font-semibold text-ink">{formatPaise(sellingPrice)}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-between border-t border-line pt-3">
                  <QuantityStepper
                    slug={product.slug}
                    name={product.name}
                    qty={line.qty}
                    size="compact"
                  />
                  <div className="text-right">
                    <span className="text-[11px] uppercase tracking-wider text-muted block">Subtotal</span>
                    <span className="text-base font-bold text-accent tabular-nums">
                      {formatPaise(totalPrice)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop / Tablet View: Full 5-Column Table (>= sm) */}
        <div className="hidden sm:block overflow-x-auto border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-subtle text-xs font-bold uppercase tracking-wider text-ink">
              <tr>
                <th scope="col" className="px-6 py-4">PRODUCT</th>
                <th scope="col" className="px-4 py-4 text-right">PRICE</th>
                <th scope="col" className="px-4 py-4 text-center">QUANTITY</th>
                <th scope="col" className="px-6 py-4 text-right">SUBTOTAL</th>
                <th scope="col" className="w-12 pl-2 pr-6 py-4 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {resolved.map(({ line, product, sellingPrice, totalPrice }) => {
                const image = product.images[0];
                const skuCode = productSku(product);

                return (
                  <tr key={product.slug} className="hover:bg-surface-subtle/50 transition-colors">
                    {/* Product image & name */}
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <Link
                          href={`/products/${product.slug}`}
                          className="relative h-16 w-16 shrink-0 overflow-hidden border border-line bg-surface-subtle"
                        >
                          {image ? (
                            <Image
                              src={image.url}
                              alt={image.alt || product.name}
                              fill
                              sizes="4rem"
                              className="object-cover"
                            />
                          ) : (
                            <span className="absolute inset-0 flex items-center justify-center text-muted">
                              <PanelPlaceholder className="h-6 w-6" />
                            </span>
                          )}
                        </Link>
                        <div>
                          <Link
                            href={`/products/${product.slug}`}
                            className="font-semibold text-ink hover:text-accent transition-colors leading-snug line-clamp-2"
                          >
                            {product.name}
                          </Link>
                          <p className="mt-1 text-xs text-muted font-mono uppercase tracking-wide">
                            SKU: {skuCode}
                          </p>
                          {product.outOfStock && (
                            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-price-off">
                              Out of stock — remove to order the rest
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="px-4 py-5 text-right font-medium text-ink tabular-nums whitespace-nowrap">
                      {formatPaise(sellingPrice)}
                    </td>

                    {/* Quantity Stepper */}
                    <td className="px-4 py-5 text-center whitespace-nowrap">
                      <div className="inline-flex justify-center">
                        <QuantityStepper
                          slug={product.slug}
                          name={product.name}
                          qty={line.qty}
                          size="compact"
                        />
                      </div>
                    </td>

                    {/* Subtotal */}
                    <td className="px-6 py-5 text-right font-bold text-accent tabular-nums whitespace-nowrap">
                      {formatPaise(totalPrice)}
                    </td>

                    {/* Delete Action */}
                    <td className="pl-2 pr-6 py-5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => removeFromCart(product.slug)}
                        aria-label={`Remove ${product.name} from cart`}
                        className="inline-flex h-8 w-8 items-center justify-center text-muted hover:text-red-600 hover:bg-red-500/10 rounded transition-colors"
                        title="Remove item"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right Column: CART TOTALS Summary Box */}
      <aside className="border border-line bg-surface p-5 sm:p-6 shadow-card lg:sticky lg:top-24">
        <h2 className="text-lg font-bold uppercase tracking-wider text-ink border-b border-line pb-4">
          CART TOTALS
        </h2>

        <div className="divide-y divide-line text-sm">
          <div className="flex items-center justify-between py-3.5">
            <span className="font-semibold text-ink">Subtotal (excl. GST)</span>
            <span className="font-semibold text-ink tabular-nums">{formatPaise(subtotal)}</span>
          </div>

          <div className="flex items-center justify-between py-3.5">
            <span className="font-semibold text-ink">Shipping</span>
            {/* Static text (client, 2026-09-17: "keep it static no motion"). It
                had a hover underline and a pointer cursor, so it looked like a
                link — but it does nothing; delivery is priced at checkout. */}
            <span className="text-xs font-medium text-accent">
              Calculate shipping
            </span>
          </div>

          <div className="flex items-center justify-between py-3.5">
            <span className="text-muted">CGST {rates.cgst}%</span>
            <span className="font-medium text-ink tabular-nums">{formatPaise(cgst)}</span>
          </div>

          <div className="flex items-center justify-between py-3.5">
            <span className="text-muted">SGST {rates.sgst}%</span>
            <span className="font-medium text-ink tabular-nums">{formatPaise(sgst)}</span>
          </div>

          <div className="flex items-center justify-between py-4 text-base font-bold">
            <span className="text-ink">Total</span>
            <span className="text-xl font-bold text-accent tabular-nums">{formatPaise(grandTotal)}</span>
          </div>
        </div>

        <Link
          href="/checkout"
          className="mt-6 block w-full bg-accent hover:bg-accent-strong py-3.5 text-center text-sm font-bold uppercase tracking-wider text-surface transition-colors shadow-sm"
        >
          PROCEED TO CHECKOUT
        </Link>
      </aside>
    </div>
  );
}
