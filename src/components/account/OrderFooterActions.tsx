"use client";

import { useEffect, useState } from "react";
import { CartIcon, CheckIcon, DownloadIcon } from "@/components/icons/ui";
import { addToCart, openCartDrawer, subscribeCartDrawerClose } from "@/lib/cart";

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
 * **Download invoice** is a link to `/account/orders/[id]/invoice`, which
 * draws the PDF on the server (`lib/invoice.ts`). It is absent — and the
 * button says why — until the order has been delivered, because until then
 * what was delivered is not settled.
 */
export function OrderFooterActions({
  items,
  invoiceHref,
}: {
  items: { slug: string; qty: number }[];
  /** The order's invoice, or null when there is nothing to invoice yet. */
  invoiceHref?: string | null;
}) {
  const [added, setAdded] = useState(false);

  useEffect(() => {
    return subscribeCartDrawerClose(() => {
      setAdded(false);
    });
  }, []);

  const repeat = () => {
    for (const item of items) {
      if (item.slug) addToCart(item.slug, item.qty);
    }
    setAdded(true);
    openCartDrawer();
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={repeat}
          className="inline-flex h-11 items-center gap-2 border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
        >
          {added ? <CheckIcon className="h-4 w-4 text-accent" /> : <CartIcon className="h-4 w-4" />}
          {added ? "Added to your cart" : "Repeat order"}
        </button>

        {/* A plain link, not a fetch: the browser saves the file itself, and
            the page the customer is reading stays where it is. */}
        {invoiceHref ? (
          <a
            href={invoiceHref}
            download
            className="inline-flex h-11 items-center gap-2 border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
          >
            <DownloadIcon className="h-4 w-4" />
            Download invoice
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="The invoice is ready once the order has been delivered"
            className="inline-flex h-11 cursor-not-allowed items-center gap-2 border border-line px-4 text-sm font-semibold text-muted"
          >
            <DownloadIcon className="h-4 w-4" />
            Download invoice
          </button>
        )}
      </div>

      {/* Under the buttons rather than beside them (client, 2026-09-25): on a
          narrow column it wrapped anyway, and half-wrapped it read as a label
          for the button next to it. */}
      {!invoiceHref && (
        <p className="mt-2 text-xs text-muted">
          The invoice is ready once this order has been delivered.
        </p>
      )}
    </div>
  );
}
