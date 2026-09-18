import type { Product } from "@/lib/types";

/**
 * Money, in one place.
 *
 * Before this file the cart page and the cart drawer each computed their own
 * subtotal and their own tax, from the same rules written out twice. That was
 * survivable while the number was only ever displayed. It stops being
 * survivable the moment an order is written to the database: if the figure the
 * customer agreed to and the figure the server charges are computed by two
 * pieces of code, they will eventually disagree, and the first anyone hears of
 * it is a customer looking at a bill that is not the one they accepted.
 *
 * So: **one function computes the total, and the browser and the server both
 * call it.** The browser's answer is what is shown; the server's answer is what
 * is stored and charged; they are the same function over the same inputs.
 *
 * ## The unit is paise
 *
 * `products.price` is whole rupees, because a list price never has paise. A
 * tax line does — 9% of ₹818 is ₹73.62 — and carrying that through a sum in
 * floating-point rupees accumulates error that eventually shows up as a
 * one-paisa mismatch against the gateway. Everything below is integer paise,
 * and it is divided by 100 exactly once, in `formatPaise`, at the point of
 * display. Paise is also the unit Razorpay's API takes, so the number stored
 * on the order is the number sent to the gateway with no conversion in
 * between.
 */

/** GST, as the cart has always displayed it: 9% + 9% on an intra-state sale.
 *
 *  **This is correct only for a delivery inside the seller's own state.** An
 *  inter-state sale is a single 18% IGST line, not two 9% lines, and it is the
 *  buyer's delivery state that decides which. The site has shown CGST+SGST
 *  since the cart was built and that is left alone here rather than changed
 *  quietly — it is a decision for the business and its accountant, and it is
 *  recorded in ARCHITECTURE.md §11 as an open one. */
export const CGST_RATE = 0.09;
export const SGST_RATE = 0.09;

export type Money = {
  /** All paise. */
  subtotal: number;
  cgst: number;
  sgst: number;
  shipping: number;
  total: number;
};

export type PricedLine = {
  slug: string;
  name: string;
  qty: number;
  /** Paise, per unit, after any discount. */
  unitPrice: number;
  /** Paise, `unitPrice * qty`. */
  lineTotal: number;
};

/**
 * A product's selling price in whole rupees — list price less its discount.
 *
 * Derived rather than stored, which is the rule schema.sql states for the
 * price columns: with three numbers stored, two of them can disagree with the
 * third. `components/product/ProductPrice` shows the same arithmetic on screen.
 */
export function sellingPriceRupees(product: Product): number {
  const price = product.price ?? 0;
  const discount = product.discountPercent ?? 0;
  return discount > 0 ? Math.round((price * (100 - discount)) / 100) : price;
}

export function sellingPricePaise(product: Product): number {
  return sellingPriceRupees(product) * 100;
}

/**
 * Resolves cart lines against the live catalogue.
 *
 * Silently drops anything that no longer exists, the same way the cart page
 * does — a product unpublished or deleted since it was added must not 404 the
 * checkout. **The server calls this too, and that is the point**: the browser
 * sends slugs and quantities, never prices, so a tampered request cannot buy a
 * ₹40,000 panel for ₹1.
 */
export function priceLines(
  lines: { slug: string; qty: number }[],
  products: Product[],
): PricedLine[] {
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  return lines
    .map((line) => {
      const product = bySlug.get(line.slug);
      if (!product) return null;
      const unitPrice = sellingPricePaise(product);
      return {
        slug: product.slug,
        name: product.name,
        qty: line.qty,
        unitPrice,
        lineTotal: unitPrice * line.qty,
      };
    })
    .filter((line): line is PricedLine => line !== null);
}

/**
 * The totals.
 *
 * Tax is rounded once, on the whole subtotal, rather than per line — rounding
 * each line and adding them up gives a different number, and the invoice
 * convention is to tax the order.
 *
 * Takes anything with a `lineTotal`, so an order's own stored lines and the
 * price-change dialog's rows go through this same arithmetic rather than a
 * hand-written `subtotal + cgst + sgst + shipping` of their own.
 */
export function totals(lines: Pick<PricedLine, "lineTotal">[], shipping = 0): Money {
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const cgst = Math.round(subtotal * CGST_RATE);
  const sgst = Math.round(subtotal * SGST_RATE);
  return { subtotal, cgst, sgst, shipping, total: subtotal + cgst + sgst + shipping };
}

/**
 * Paise to a displayed rupee string.
 *
 * The one place the division happens. `lib/cart.ts`'s `formatRupees` takes
 * rupees and is what the older display code calls; this takes paise and
 * produces a byte-identical string, so the two can coexist while the paise
 * unit spreads.
 */
export function formatPaise(paise: number): string {
  return (
    "₹" +
    (paise / 100).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Re-prices an order's own lines against today's catalogue (client,
 * 2026-09-17: recheck when "Pay now" is pressed).
 *
 * **It keeps the order's lines and only changes their prices.** `priceLines`
 * drops anything missing from the catalogue, which is right for a cart and
 * wrong for an order: dropping a line would quietly remove something the
 * customer ordered. A product withdrawn since keeps the price it was bought
 * at, and says so with `unavailable`.
 *
 * Returns every line, plus just the ones whose unit price moved — which is
 * what the customer is shown before being charged the new total.
 */
export type RepricedLine = PricedLine & {
  /** The order item this came from. */
  id: string;
  /** Paise, as the order recorded it. */
  wasUnitPrice: number;
  /** No longer in the catalogue, so its price could not be rechecked. */
  unavailable: boolean;
};

export function repriceOrderItems(
  items: { id: string; slug: string; name: string; qty: number; unitPrice: number }[],
  products: Product[],
): { lines: RepricedLine[]; changed: RepricedLine[] } {
  const bySlug = new Map(products.map((product) => [product.slug, product]));

  const lines = items.map((item) => {
    const product = bySlug.get(item.slug);
    const unitPrice = product ? sellingPricePaise(product) : item.unitPrice;
    return {
      id: item.id,
      slug: item.slug,
      /* The order's own name, not the catalogue's: an order is a snapshot of
         what was bought, and a product renamed since is still that product. */
      name: item.name,
      qty: item.qty,
      unitPrice,
      lineTotal: unitPrice * item.qty,
      wasUnitPrice: item.unitPrice,
      unavailable: !product,
    };
  });

  return { lines, changed: lines.filter((line) => line.unitPrice !== line.wasUnitPrice) };
}
