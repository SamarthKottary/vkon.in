"use client";

import { MinusIcon, PlusIcon, TrashIcon } from "@/components/icons/ui";
import { addToCart, setCartQty } from "@/lib/cart";

/**
 * − / quantity / + for one product, shared by the card and the cart page.
 *
 * **At a quantity of one, minus becomes a bin.** Decrementing to zero removes
 * the line either way, so the icon says which it is about to do rather than
 * leaving the visitor to discover that the last press deletes the row.
 *
 * **Every press stops propagation.** On a product card this sits inside a
 * stretched link — an invisible sheet over the whole card that navigates on
 * click — so without it, adjusting a quantity would also take the visitor to
 * the product page. The buttons are `type="button"` for the same class of
 * reason: inside any future form they would otherwise submit it.
 *
 * The count is `aria-live="polite"` so a screen reader hears the new quantity
 * without focus moving; the buttons keep their own labels naming the product,
 * because "plus" alone tells a visitor scanning a row of cards nothing.
 */
export function QuantityStepper({
  slug,
  name,
  qty,
  size = "compact",
  className = "",
}: {
  slug: string;
  /** For the accessible names — never rendered. */
  name: string;
  qty: number;
  size?: "compact" | "default";
  className?: string;
}) {
  const compact = size === "compact";
  const btnSize = compact ? "h-9 w-8 shrink-0" : "h-12 w-12 shrink-0";
  const icon = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  const press = (event: React.MouseEvent, run: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    run();
  };

  return (
    <div
      className={`relative z-10 inline-flex shrink-0 items-center border border-line-strong bg-surface-raised ${
        compact ? "h-9 w-24" : "h-12 w-40 rounded-sm"
      } ${className}`}
    >
      <button
        type="button"
        onClick={(e) => press(e, () => setCartQty(slug, qty - 1))}
        aria-label={
          qty === 1 ? `Remove ${name} from cart` : `Decrease quantity of ${name}`
        }
        className={`${btnSize} inline-flex items-center justify-center text-muted transition-colors hover:bg-surface-subtle hover:text-ink`}
      >
        {qty === 1 ? (
          <TrashIcon className={icon} />
        ) : (
          <MinusIcon className={icon} />
        )}
      </button>

      <span
        aria-live="polite"
        className={`flex-1 text-center font-mono tabular-nums text-ink ${
          compact ? "text-[0.8125rem]" : "text-sm"
        }`}
      >
        {qty}
      </span>

      <button
        type="button"
        onClick={(e) => press(e, () => addToCart(slug, 1))}
        aria-label={`Increase quantity of ${name}`}
        className={`${btnSize} inline-flex items-center justify-center text-muted transition-colors hover:bg-surface-subtle hover:text-ink`}
      >
        <PlusIcon className={icon} />
      </button>
    </div>
  );
}
