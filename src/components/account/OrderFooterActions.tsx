"use client";

import { useState } from "react";
import { CartIcon, CheckIcon, DownloadIcon } from "@/components/icons/ui";
import { addToCart, openCartDrawer } from "@/lib/cart";

/**
 * What to do with an order you are looking at (client, 2026-09-17): buy it
 * again, or take an invoice.
 *
 * **Repeat order adds to the cart, it does not replace it.** `addToCart` adds
 * to whatever quantity is already there, so a cart with two of something and
 * an order containing one leaves three — nothing somebody was in the middle of
 * choosing is thrown away. The drawer opens afterwards so it is obvious where
 * the items went, and the button stays pressable in case they want more.
 *
 * The lines are this order's own snapshot (slug and quantity). A product
 * withdrawn from the catalogue since simply does not price at checkout, which
 * is the same thing that happens to a stale cart.
 *
 * **Download invoice is a placeholder**, disabled and saying so: invoices need
 * numbering and a GST decision first (docs/EMAILS.md §3, E).
 */
export function OrderFooterActions({
  items,
}: {
  items: { slug: string; qty: number }[];
}) {
  const [added, setAdded] = useState(false);

  const repeat = () => {
    for (const item of items) {
      if (item.slug) addToCart(item.slug, item.qty);
    }
    setAdded(true);
    openCartDrawer();
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={repeat}
        className="inline-flex h-11 items-center gap-2 border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
      >
        {added ? <CheckIcon className="h-4 w-4 text-accent" /> : <CartIcon className="h-4 w-4" />}
        {added ? "Added to your cart" : "Repeat order"}
      </button>

      <button
        type="button"
        disabled
        title="Invoices are coming soon"
        className="inline-flex h-11 cursor-not-allowed items-center gap-2 border border-line px-4 text-sm font-semibold text-muted"
      >
        <DownloadIcon className="h-4 w-4" />
        Download invoice
      </button>

      <span className="text-xs text-muted">Invoices are coming soon.</span>
    </div>
  );
}
