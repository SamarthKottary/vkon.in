"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CloseIcon } from "@/components/icons/ui";
import { QuantityStepper } from "@/components/cart/QuantityStepper";
import { useCartLines } from "@/components/cart/useCart";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { formatRupees, subscribeCartDrawer } from "@/lib/cart";
import type { Product } from "@/lib/types";

/**
 * Slide-over Mini Cart Drawer that slides smoothly and slowly from the right edge.
 * Opens when adding a new product to cart or clicking the header cart icon.
 */
export function CartDrawer({ products = [] }: { products?: Product[] }) {
  const [open, setOpen] = useState(false);
  const lines = useCartLines();

  // Listen to drawer open trigger events
  useEffect(() => {
    return subscribeCartDrawer(() => {
      setOpen(true);
    });
  }, []);

  // Prevent background scroll when open
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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

  const subtotal = useMemo(() => {
    return resolved.reduce((sum, item) => sum + item.totalPrice, 0);
  }, [resolved]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex justify-end transition-opacity duration-500 ease-in-out ${
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none delay-150"
      }`}
    >
      {/* Darkened backdrop */}
      <button
        type="button"
        aria-label="Close cart drawer"
        onClick={() => setOpen(false)}
        className={`fixed inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-xs transition-opacity duration-500 ease-in-out ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Drawer panel sliding smoothly from right */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className={`relative flex h-full w-full max-w-md flex-col bg-surface shadow-2xl transition-transform duration-500 ease-out border-l border-line ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex h-16 items-center justify-between border-b border-line px-6">
          <h2 className="text-xl font-bold text-ink">Shopping cart</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink"
          >
            <CloseIcon className="h-4 w-4" />
            Close
          </button>
        </div>

        {/* Drawer Content / Items list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {resolved.length === 0 ? (
            <div className="py-16 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-subtle text-muted">
                <PanelPlaceholder className="h-7 w-7" />
              </span>
              <p className="mt-4 text-base font-semibold text-ink">Your cart is empty</p>
              <p className="mt-1 text-sm text-muted">
                Explore our motor starters and control panels to add items.
              </p>
              <Link
                href="/products"
                onClick={() => setOpen(false)}
                className="mt-6 inline-flex h-10 items-center justify-center bg-accent px-5 text-sm font-semibold text-surface transition-colors hover:bg-accent-strong"
              >
                Browse products
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {resolved.map(({ line, product, sellingPrice }) => {
                const image = product.images[0];
                const skuCode = `ST${product.slug.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10)}`;

                return (
                  <li key={product.slug} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    <Link
                      href={`/products/${product.slug}`}
                      onClick={() => setOpen(false)}
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
                          <PanelPlaceholder className="h-7 w-7" />
                        </span>
                      )}
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-ink leading-snug line-clamp-2">
                          <Link
                            href={`/products/${product.slug}`}
                            onClick={() => setOpen(false)}
                            className="hover:text-accent transition-colors"
                          >
                            {product.name}
                          </Link>
                        </h3>
                        <p className="mt-1 text-xs text-muted font-mono uppercase tracking-wide">
                          SKU: {skuCode}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <QuantityStepper
                          slug={product.slug}
                          name={product.name}
                          qty={line.qty}
                          size="compact"
                        />
                        <span className="text-sm font-semibold text-ink tabular-nums">
                          {line.qty} × <span className="text-accent font-bold">{formatRupees(sellingPrice)}</span>
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Drawer Footer */}
        {resolved.length > 0 && (
          <div className="border-t border-line bg-surface-raised p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between text-base font-bold text-ink">
              <span>Subtotal:</span>
              <span className="text-xl font-bold text-accent tabular-nums">
                {formatRupees(subtotal)}
              </span>
            </div>

            <div className="space-y-2.5 pt-2">
              <Link
                href="/cart"
                onClick={() => setOpen(false)}
                className="block w-full bg-[#f4f4f4] hover:bg-gray-200 dark:bg-surface-subtle dark:hover:bg-line text-ink font-bold text-xs uppercase tracking-wider py-3.5 text-center transition-colors border border-line"
              >
                VIEW CART
              </Link>
              <Link
                href="/cart"
                onClick={() => setOpen(false)}
                className="block w-full bg-accent hover:bg-accent-strong text-surface font-bold text-xs uppercase tracking-wider py-3.5 text-center transition-colors shadow-sm"
              >
                CHECKOUT
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
