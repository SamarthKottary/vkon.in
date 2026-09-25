"use client";

import { useGst } from "@/components/pricing/GstProvider";
import { displayPricePaise, listPricePaise } from "@/lib/pricing";
import type { Product } from "@/lib/types";

/**
 * The price block, in the shape the client drew (2026-09-25):
 *
 *     MRP ₹23,555 (-15%)        ← struck through, the reduction beside it
 *     ₹22,342  incl. all taxes
 *
 * **The M.R.P. leads and the selling price follows**, which is the order a
 * shopper reads a discount in — what it was, then what it is. It replaced the
 * older arrangement (percentage badge, price, M.R.P. beneath) on every surface
 * at once, so a card, the quick view and the product page cannot disagree
 * about what a price looks like.
 *
 * **Two shapes, by how much room there is.** On the wide cards — featured and
 * horizontal — "incl. all taxes" sits beside the figure, two lines in total.
 * Everywhere with vertical room — the grid cards, the quick view and the
 * product page — it takes its own third line.
 *
 * **The selling price is derived, never stored.** `price` is the M.R.P. and
 * `discountPercent` the reduction; what the customer pays is computed here, so
 * the three numbers on screen cannot disagree with each other.
 *
 * **Both figures include GST** (client, 2026-09-25), in the order the client
 * set out: M.R.P. less the discount, and tax on what is left. The M.R.P.
 * carries the same tax, or the percentage would stop being the difference
 * between the two. The rates come from `GstProvider`, so changing them in the
 * admin changes every price on the site; the checkout takes the same money
 * apart again into its base and the two tax lines.
 *
 * Paise are shown only when there are any: tax on a whole-rupee price rarely
 * lands on a round figure, and hiding the 32p here while the cart charges it
 * would be the mismatch this component exists to prevent.
 */

type Size = "compact" | "medium" | "regular";

/** Type scale per size: the M.R.P. line, the figure, and the tax note. */
const SCALE: Record<Size, { mrp: string; price: string; note: string; gap: string }> = {
  compact: {
    mrp: "text-[0.6875rem] leading-tight",
    price: "text-base",
    note: "text-[0.625rem] leading-tight",
    gap: "mt-0.5",
  },
  medium: {
    mrp: "text-xs leading-tight",
    price: "text-lg sm:text-2xl",
    note: "text-[0.6875rem] leading-tight",
    gap: "mt-1",
  },
  regular: {
    mrp: "text-xs sm:text-sm leading-tight",
    price: "text-xl sm:text-3xl",
    note: "text-xs leading-tight",
    gap: "mt-1",
  },
};

export function ProductPrice({
  product,
  size = "compact",
  variant = "stacked",
  className = "",
}: {
  product: Pick<Product, "price" | "discountPercent">;
  size?: Size;
  variant?: "stacked" | "inline-desktop";
  className?: string;
}) {
  const rates = useGst();
  const { price, discountPercent } = product;
  if (price == null) return null;

  const scale = SCALE[size];
  const hasDiscount = discountPercent != null && discountPercent > 0;
  const selling = rupees(displayPricePaise({ price, discountPercent } as Product, rates));
  const list = rupees(listPricePaise({ price } as Product, rates));
  /* The wide cards put the note beside the figure; everything else gives it a
     line of its own. */
  const beside = variant === "inline-desktop";

  return (
    <div className={`min-w-0 ${className}`}>
      {hasDiscount && (
        <p className={`text-muted ${scale.mrp}`}>
          MRP{" "}
          <span className="line-through">
            <span aria-hidden>₹</span>
            <span className="sr-only">Rupees </span>
            {list}
          </span>{" "}
          <span className="font-medium text-price-off">(-{discountPercent}%)</span>
        </p>
      )}

      <p
        className={`flex flex-wrap items-baseline gap-x-1.5 tabular-nums ${hasDiscount ? scale.gap : ""}`}
      >
        <span className={`font-semibold leading-tight text-ink ${scale.price}`}>
          <span
            aria-hidden
            className={size === "regular" ? "text-[0.6em] align-super" : "text-[0.75em]"}
          >
            ₹
          </span>
          <span className="sr-only">Rupees </span>
          {selling}
        </span>
        {beside && <span className={`text-muted ${scale.note}`}>incl. all taxes</span>}
      </p>

      {!beside && <p className={`text-muted ${scale.note}`}>incl. all taxes</p>}
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
