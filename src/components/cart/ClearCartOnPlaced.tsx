"use client";

import { useEffect } from "react";
import { clearCart } from "@/lib/cart";

/**
 * Empties the cart, once, on the order confirmation page.
 *
 * **This is the only place the cart is cleared after a purchase, and it is
 * here for a reason.** The obvious places both fail:
 *
 *  - *On submit*, in the checkout form — empties the basket of anybody whose
 *    order then fails server-side validation, leaving them nothing to retry.
 *  - *On a success state* — there is no success state to read. The action
 *    redirects, so the checkout form is unmounted before one could arrive.
 *
 * The confirmation page renders only when an order actually exists in the
 * database and belongs to the person looking at it. That is the one moment
 * that is unambiguously "this was bought", so that is where the cart goes.
 *
 * Rendered only when `?placed=` matches the order being shown, so revisiting
 * an old order later does not empty a cart that has since been refilled.
 */
export function ClearCartOnPlaced() {
  useEffect(() => {
    clearCart();
  }, []);

  return null;
}
