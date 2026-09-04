"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRightIcon } from "@/components/icons/ui";
import { QuantityStepper } from "@/components/cart/QuantityStepper";
import { useCartLines } from "@/components/cart/useCart";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { formatRupees } from "@/lib/cart";
import type { Product } from "@/lib/types";

/**
 * Full Cart Page component:
 * - Left column: Item table with image, name, SKU, price, quantity, subtotal (no front X column).
 * - Right column: CART TOTALS with Subtotal, Shipping, CGST 9%, SGST 9%, and Total using website accent green.
 */
export function CartList({ products }: { products: Product[] }) {
  const lines = useCartLines();

  const resolved = useMemo(() => {
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    return (lines ?? [])
      .map((line) => {
        const product = bySlug.get(line.slug);
        if (!product) return null;

        const price = product.price ?? 0;
        const discount = product.discountPercent ?? 0;
        const sellingPrice = discount > 0 ? Math.round((price * (100 - discount)) / 100) : price;

        return {
          line,
          product,
          sellingPrice,
          totalPrice: sellingPrice * line.qty,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [lines, products]);

  // Tax and total calculations
  const subtotal = useMemo(() => {
    return resolved.reduce((sum, item) => sum + item.totalPrice, 0);
  }, [resolved]);

  const cgst = Math.round(subtotal * 0.09 * 100) / 100;
  const sgst = Math.round(subtotal * 0.09 * 100) / 100;
  const grandTotal = Math.round((subtotal + cgst + sgst) * 100) / 100;

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
        <div className="overflow-x-auto border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-subtle text-xs font-bold uppercase tracking-wider text-ink">
              <tr>
                <th scope="col" className="px-6 py-4">PRODUCT</th>
                <th scope="col" className="px-4 py-4 text-right">PRICE</th>
                <th scope="col" className="px-4 py-4 text-center">QUANTITY</th>
                <th scope="col" className="px-6 py-4 text-right">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {resolved.map(({ line, product, sellingPrice, totalPrice }) => {
                const image = product.images[0];
                const skuCode = `ST${product.slug.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10)}`;

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
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="px-4 py-5 text-right font-medium text-ink tabular-nums whitespace-nowrap">
                      {formatRupees(sellingPrice)}
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
                      {formatRupees(totalPrice)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right Column: CART TOTALS Summary Box */}
      <aside className="border border-line bg-surface p-6 shadow-card lg:sticky lg:top-24">
        <h2 className="text-lg font-bold uppercase tracking-wider text-ink border-b border-line pb-4">
          CART TOTALS
        </h2>

        <div className="divide-y divide-line text-sm">
          <div className="flex items-center justify-between py-3.5">
            <span className="font-semibold text-ink">Subtotal</span>
            <span className="font-semibold text-ink tabular-nums">{formatRupees(subtotal)}</span>
          </div>

          <div className="flex items-center justify-between py-3.5">
            <span className="font-semibold text-ink">Shipping</span>
            <span className="text-xs font-medium text-accent hover:underline cursor-pointer">
              Calculate shipping
            </span>
          </div>

          <div className="flex items-center justify-between py-3.5">
            <span className="text-muted">CGST 9%</span>
            <span className="font-medium text-ink tabular-nums">{formatRupees(cgst)}</span>
          </div>

          <div className="flex items-center justify-between py-3.5">
            <span className="text-muted">SGST 9%</span>
            <span className="font-medium text-ink tabular-nums">{formatRupees(sgst)}</span>
          </div>

          <div className="flex items-center justify-between py-4 text-base font-bold">
            <span className="text-ink">Total</span>
            <span className="text-xl font-bold text-accent tabular-nums">{formatRupees(grandTotal)}</span>
          </div>
        </div>

        <Link
          href="/contact"
          className="mt-6 block w-full bg-accent hover:bg-accent-strong py-3.5 text-center text-sm font-bold uppercase tracking-wider text-surface transition-colors shadow-sm"
        >
          PROCEED TO CHECKOUT
        </Link>
      </aside>
    </div>
  );
}
