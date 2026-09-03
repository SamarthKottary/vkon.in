import type { Product } from "@/lib/types";

/**
 * The price block, in the Indian retail idiom the client asked for:
 *
 *     -47%  ₹6,895
 *     M.R.P.: ₹12,999      ← struck through
 *
 * **The selling price is derived, never stored.** `price` is the M.R.P. and
 * `discountPercent` the reduction; what the customer pays is computed here, so
 * the three numbers on screen cannot disagree with each other. Rounded to the
 * rupee — half the catalogue is priced in whole hundreds and a trailing `.53`
 * would read as a mistake.
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
  const { price, discountPercent } = product;
  if (price == null) return null;

  const hasDiscount = discountPercent != null && discountPercent > 0;
  const selling = hasDiscount
    ? Math.round((price * (100 - discountPercent)) / 100)
    : price;

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
            {selling.toLocaleString("en-IN")}
          </span>
        </p>

        {hasDiscount && (
          <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted">
            M.R.P.:{" "}
            <span className="line-through">
              <span aria-hidden>₹</span>
              <span className="sr-only">Rupees </span>
              {price.toLocaleString("en-IN")}
            </span>
          </p>
        )}
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
              {selling.toLocaleString("en-IN")}
            </span>
          </p>

          {hasDiscount && (
            <p className="text-[0.6875rem] leading-tight text-muted">
              M.R.P.:{" "}
              <span className="line-through">
                <span aria-hidden>₹</span>
                <span className="sr-only">Rupees </span>
                {price.toLocaleString("en-IN")}
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
            {selling.toLocaleString("en-IN")}
          </span>

          {hasDiscount && (
            <>
              <span className="text-xs text-muted leading-tight">
                M.R.P.:{" "}
                <span className="line-through">
                  <span aria-hidden>₹</span>
                  <span className="sr-only">Rupees </span>
                  {price.toLocaleString("en-IN")}
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
          {selling.toLocaleString("en-IN")}
        </span>
      </p>

      {hasDiscount && (
        <p className="text-[0.6875rem] leading-tight text-muted">
          M.R.P.:{" "}
          <span className="line-through">
            <span aria-hidden>₹</span>
            <span className="sr-only">Rupees </span>
            {price.toLocaleString("en-IN")}
          </span>
        </p>
      )}
    </div>
  );
}
