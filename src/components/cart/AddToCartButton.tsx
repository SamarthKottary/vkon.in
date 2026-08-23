"use client";

import { CartIcon } from "@/components/icons/ui";
import { QuantityStepper } from "@/components/cart/QuantityStepper";
import { useCartQty } from "@/components/cart/useCart";
import { addToCart } from "@/lib/cart";

/**
 * "Add to cart" — which becomes the quantity stepper once the product is in.
 *
 * **The stepper replacing the button is the confirmation.** An earlier build
 * flashed "Added" for two seconds and reverted, which said the press landed
 * but not what the cart now holds, and said nothing at all by the time the
 * visitor looked back. A count that stays is both.
 *
 * **Green, against the house rule, at the client's request** (2026-08-23).
 * Rule 3 in `globals.css` reserves the accent for links, active state and
 * small marks, with primary actions in near-black — so this is the one place
 * that departs from it. `bg-accent text-surface` is the pairing the `accent`
 * variant of `ui/Button` already uses, rather than a new colour: white on the
 * accent green measures 1.9:1 and would fail badly.
 *
 * **`whitespace-nowrap` and `shrink-0` are load-bearing.** On the product page
 * this sits in a flex row beside two other buttons. Without them it shrank and
 * the label wrapped to three lines — "Add / to / cart" — overflowing the
 * button onto the image behind it, at desktop width only, because that is the
 * breakpoint where the row is a row. `ui/Button` carries `whitespace-nowrap`
 * for the same reason; this had been written without it.
 *
 * **`relative z-10` and `stopPropagation` on a card.** Product cards are
 * stretched-link: the title's `after:absolute after:inset-0` lays an invisible
 * sheet over the whole card, so a button beneath it cannot be clicked at all,
 * and a click that bubbles navigates away instead of adding.
 */
export function AddToCartButton({
  slug,
  name,
  size = "default",
  className = "",
}: {
  slug: string;
  /** Only for the accessible name — the visible label stays short. */
  name: string;
  /** "compact" is the in-card form; "default" is the product page's. */
  size?: "default" | "compact";
  className?: string;
}) {
  const qty = useCartQty(slug);
  const compact = size === "compact";

  if (qty > 0) {
    return (
      <QuantityStepper
        slug={slug}
        name={name}
        qty={qty}
        size={compact ? "compact" : "default"}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        addToCart(slug, 1);
      }}
      aria-label={`Add ${name} to cart`}
      className={`relative z-10 inline-flex shrink-0 items-center justify-center whitespace-nowrap bg-accent font-medium text-surface transition-colors hover:bg-accent-strong ${
        compact
          ? "h-9 gap-2 px-3 text-[0.8125rem]"
          : "h-12 gap-2.5 px-6 text-[0.9375rem]"
      } ${className}`}
    >
      <CartIcon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {/* Labelled at every width (client, 2026-08-23). It was icon-only below
          `sm` on the assumption a narrow card could not carry the word; the
          cards are wide enough — 82-92% of the viewport — that "Add" fits
          beside "View details" with room to spare. */}
      <span>{compact ? "Add" : "Add to cart"}</span>
    </button>
  );
}
