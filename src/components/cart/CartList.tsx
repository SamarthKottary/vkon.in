"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRightIcon, TrashIcon, WhatsAppIcon } from "@/components/icons/ui";
import { QuantityStepper } from "@/components/cart/QuantityStepper";
import { useCartLines } from "@/components/cart/useCart";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { categoryLabel } from "@/content/taxonomy";
import { site } from "@/content/site";
import { whatsAppLink } from "@/lib/contact";
import { cartCount, clearCart, removeFromCart } from "@/lib/cart";
import type { Product } from "@/lib/types";

/**
 * The cart's contents.
 *
 * `products` is the live published catalogue, passed from the server page.
 * Stored slugs are resolved against it, so anything renamed, unpublished or
 * deleted drops out on its own rather than linking to a 404 — the same
 * contract `RecentlyViewed` works to.
 *
 * **There is no checkout yet, and this does not pretend otherwise.** The
 * primary action sends the list to WhatsApp, which is how the business already
 * takes orders. When a real checkout exists it replaces that block; nothing
 * else here changes, because the cart never stored prices or totals.
 *
 * The summary is `sticky` from `lg`, where there is a column beside the list
 * to hold it. Below that it sits after the items, because a bar pinned over a
 * short list on a phone covers the thing it is summarising.
 */
export function CartList({ products }: { products: Product[] }) {
  const lines = useCartLines();

  const resolved = useMemo(() => {
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    return (lines ?? [])
      .map((line) => ({ line, product: bySlug.get(line.slug) }))
      .filter(
        (entry): entry is { line: { slug: string; qty: number }; product: Product } =>
          Boolean(entry.product),
      );
  }, [lines, products]);

  // `null` is the pre-hydration state, not an empty cart — see `useCart.ts`.
  if (lines === null) return null;

  if (resolved.length === 0) {
    return (
      <div className="border border-line bg-surface-raised px-6 py-20 text-center shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-subtle text-muted">
          <PanelPlaceholder className="h-7 w-7" />
        </span>
        <p className="mt-5 text-lg text-ink">Your cart is empty</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Add a panel from the catalogue and it will appear here, ready to send
          us for a quote.
        </p>
        <Link
          href="/products"
          className="mt-7 inline-flex h-11 items-center justify-center gap-2 bg-accent px-5 text-[0.9375rem] font-medium text-surface transition-colors hover:bg-accent-strong"
        >
          Browse products
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const units = cartCount(resolved.map((entry) => entry.line));
  const message =
    `Hello ${site.name}, I would like a quote for:\n` +
    resolved.map(({ line, product }) => `• ${product.name} × ${line.qty}`).join("\n");

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-12">
      <ul className="space-y-4">
        {resolved.map(({ line, product }) => {
          const image = product.images[0];

          return (
            <li
              key={product.slug}
              className="flex gap-4 border border-line bg-surface-raised p-4 shadow-card transition-colors hover:border-line-strong sm:gap-5 sm:p-5"
            >
              <Link
                href={`/products/${product.slug}`}
                className="relative h-20 w-20 shrink-0 overflow-hidden border border-line bg-surface-subtle sm:h-24 sm:w-24"
              >
                {image ? (
                  <Image
                    src={image.url}
                    alt={image.alt || product.name}
                    fill
                    sizes="6rem"
                    className="object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <PanelPlaceholder className="h-9 w-9" />
                  </span>
                )}
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <p className="label-tech text-muted">
                  {categoryLabel(product.category)}
                </p>
                <h2 className="mt-1.5 text-[0.9375rem] leading-snug">
                  <Link
                    href={`/products/${product.slug}`}
                    className="transition-colors hover:text-accent"
                  >
                    {product.name}
                  </Link>
                </h2>
                {product.hpRanges.length > 0 && (
                  <p className="mt-1.5 font-mono text-[0.75rem] text-muted">
                    {product.hpRanges.join("  ·  ")}
                  </p>
                )}

                {/* `mt-auto` pins the controls to the bottom of the row, so
                    they line up across items whose names run to different
                    numbers of lines. */}
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
                  <QuantityStepper
                    slug={product.slug}
                    name={product.name}
                    qty={line.qty}
                  />
                  <button
                    type="button"
                    onClick={() => removeFromCart(product.slug)}
                    className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-red-700"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Remove
                    <span className="sr-only"> {product.name} from cart</span>
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="border border-line bg-surface-raised p-6 shadow-card lg:sticky lg:top-24">
        <h2 className="text-lg leading-snug">Summary</h2>

        <dl className="mt-5 space-y-2.5 border-y border-line py-5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Products</dt>
            <dd className="font-mono tabular-nums text-ink">{resolved.length}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Total units</dt>
            <dd aria-live="polite" className="font-mono tabular-nums text-ink">
              {units}
            </dd>
          </div>
        </dl>

        {/* No price line, and deliberately no placeholder for one: products
            carry no price field yet, and a total that silently omitted tax or
            delivery would be worse than none. */}
        <p className="mt-5 text-sm leading-relaxed text-muted">
          We will price the whole list and come back with the nearest dealer who
          stocks it.
        </p>

        <a
          href={whatsAppLink(message)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2.5 whitespace-nowrap bg-accent px-5 text-[0.9375rem] font-medium text-surface transition-colors hover:bg-accent-strong"
        >
          <WhatsAppIcon className="h-4 w-4" />
          Request a quote
        </a>

        <div className="mt-5 flex items-center justify-between gap-4">
          <Link
            href="/products"
            className="text-sm text-muted underline underline-offset-4 transition-colors hover:text-ink"
          >
            Keep browsing
          </Link>
          <button
            type="button"
            onClick={clearCart}
            className="text-sm text-muted underline underline-offset-4 transition-colors hover:text-red-700"
          >
            Clear cart
          </button>
        </div>
      </aside>
    </div>
  );
}
