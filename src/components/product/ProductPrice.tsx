"use client";

import { useGst } from "@/components/pricing/GstProvider";
import { displayPricePaise, listPricePaise } from "@/lib/pricing";
import type { Product } from "@/lib/types";

/**
 * The price block, in the Indian retail idiom the client asked for:
 *
 *     -47%  ₹6,895
 *     M.R.P.: ₹12,999      ← struck through
 *
 * **The selling price is derived, never stored.** `price` is the M.R.P. and
 * `discountPercent` the reduction; what the customer pays is computed here, so
 * the three numbers on screen cannot disagree with each other.
 *
 * **Both figures include GST** (client, 2026-09-25: "let the price which is
 * displayed on the products be the price which includes sgst and cgst"), in
 * the order the client set out: M.R.P. less the discount, and tax on what is
 * left. The M.R.P. beside it carries the same tax, or the percentage would no
 * longer be the difference between the two. The rates come from
 * `GstProvider`, so changing them in the admin changes every price on the
 * site. The checkout takes the same money apart again into its base and the
 * two tax lines — which is why the taxable base, not this, is what an order
 * stores.
 *
 * Paise are shown only when there are any: tax on a whole-rupee price rarely
 * lands on a round figure, and hiding the 32p here while the cart charges it
 * would be the mismatch this component exists to prevent.
 *
 * Three states, and the empty one matters as much as the other two:
 *
 *  - **no price** → renders nothing. Every row in the database is unpriced the
 *    day this ships, so each caller decides what stands in its place rather
 *    than being handed a blank. The cards fall back to "View details", which
 *    is exactly what they showed before.
 *  - **price, no discount** → the price alone. No `-0%` badge, no strikethrough
 *    against itself.
 *  - **both** → all three parts.
 *
 * `size` is the only knob, and it exists because of a hard constraint rather
 * than taste: on a card this block replaces a single line of text inside a row
 * whose height is reserved by an invisible clone (`ProductCard`), so `compact`
 * has to fit two lines into the 36px that one line of "View details" used to
 * occupy. `regular` is for the Quick View footer and the product page, where
 * there is room for the figure to carry the weight it does in the reference.
 */
export function ProductPrice({
  product,
  size = "compact",
  variant = "stacked",
  className = "",
}: {
  product: Pick<Product, "price" | "discountPercent">;
  size?: "compact" | "regular";
  variant?: "stacked" | "inline-desktop";
  className?: string;
}) {
  const rates = useGst();
  const { price, discountPercent } = product;
  if (price == null) return null;

  const hasDiscount = discountPercent != null && discountPercent > 0;
  const selling = rupees(displayPricePaise({ price, discountPercent } as Product, rates));
  const list = rupees(listPricePaise({ price } as Product, rates));

  if (size === "regular") {
    return (
      <div className={`min-w-0 ${className}`}>
        <p className="flex items-baseline gap-1 sm:gap-1.5 tabular-nums">
          {hasDiscount && (
            <span className="font-medium text-price-off text-lg sm:text-2xl">
              -{discountPercent}%
            </span>
          )}
          <span className="font-semibold leading-tight text-ink text-xl sm:text-3xl">
            <span aria-hidden className="text-[0.6em] align-super">
              ₹
            </span>
            <span className="sr-only">Rupees </span>
            {selling}
          </span>
        </p>

        {hasDiscount && (
          <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted">
            M.R.P.:{" "}
            <span className="line-through">
              <span aria-hidden>₹</span>
              <span className="sr-only">Rupees </span>
              {list}
            </span>
          </p>
        )}
        {/* Said once, where there is room for it: the figure above is what the
            customer pays, and the checkout shows the tax inside it. */}
        <p className="mt-0.5 text-xs text-muted">Inclusive of all taxes</p>
      </div>
    );
  }

  if (variant === "inline-desktop") {
    return (
      <div className={`min-w-0 ${className}`}>
        {/* Mobile view (< sm): 2-line layout */}
        <div className="block sm:hidden">
          <p className="flex items-baseline gap-1.5 tabular-nums">
            {hasDiscount && (
              <span className="font-medium text-price-off text-sm">
                -{discountPercent}%
              </span>
            )}
            <span className="font-semibold leading-tight text-ink text-base">
              <span aria-hidden className="text-[0.75em]">
                ₹
              </span>
              <span className="sr-only">Rupees </span>
              {selling}
            </span>
          </p>

          {hasDiscount && (
            <p className="text-[0.6875rem] leading-tight text-muted">
              M.R.P.:{" "}
              <span className="line-through">
                <span aria-hidden>₹</span>
                <span className="sr-only">Rupees </span>
                {list}
              </span>
            </p>
          )}
        </div>

        {/* Desktop view (>= sm): ₹15,999 M.R.P.: ₹27,999 (43% off) */}
        <div className="hidden sm:flex sm:items-baseline sm:gap-1.5 tabular-nums flex-wrap">
          <span className="font-semibold leading-tight text-ink text-base sm:text-lg">
            <span aria-hidden className="text-[0.75em]">
              ₹
            </span>
            <span className="sr-only">Rupees </span>
            {selling}
          </span>

          {hasDiscount && (
            <>
              <span className="text-xs text-muted leading-tight">
                M.R.P.:{" "}
                <span className="line-through">
                  <span aria-hidden>₹</span>
                  <span className="sr-only">Rupees </span>
                  {list}
                </span>
              </span>

              <span className="text-xs font-medium text-price-off leading-tight">
                ({discountPercent}% off)
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-w-0 ${className}`}>
      <p className="flex items-baseline gap-1.5 tabular-nums">
        {hasDiscount && (
          <span className="font-medium text-price-off text-sm">
            -{discountPercent}%
          </span>
        )}
        <span className="font-semibold leading-tight text-ink text-base">
          <span aria-hidden className="text-[0.75em]">
            ₹
          </span>
          <span className="sr-only">Rupees </span>
          {selling}
        </span>
      </p>

      {hasDiscount && (
        <p className="text-[0.6875rem] leading-tight text-muted">
          M.R.P.:{" "}
          <span className="line-through">
            <span aria-hidden>₹</span>
            <span className="sr-only">Rupees </span>
            {list}
          </span>
        </p>
      )}
    </div>
  );
}

/** Paise as a rupee figure, with the paise only when there are any. */
function rupees(paise: number): string {
  const whole = paise % 100 === 0;
  return (paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
