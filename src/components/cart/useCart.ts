"use client";

import { useSyncExternalStore } from "react";
import {
  getCartServerSnapshot,
  getCartSnapshot,
  parseCart,
  subscribeCart,
  type CartLine,
} from "@/lib/cart";

/**
 * The cart's lines, or `null` before storage has been read.
 *
 * `useSyncExternalStore` rather than `useEffect` + `setState` — `localStorage`
 * is the external store that hook exists for, and it is what the
 * `react-hooks/set-state-in-effect` rule pushes towards.
 *
 * **`null` is not an empty cart.** It is the server render and the hydration
 * pass. Callers must branch on it rather than collapsing it to `[]`, or a
 * returning visitor sees an empty state flash before their cart appears. Same
 * contract as `lib/recent.ts`.
 *
 * Note the raw string is what the store returns, so the snapshot stays
 * referentially stable; parsing happens here, on that value.
 */
export function useCartLines(): CartLine[] | null {
  const raw = useSyncExternalStore<string | null>(
    subscribeCart,
    getCartSnapshot,
    getCartServerSnapshot,
  );

  return raw === null ? null : parseCart(raw);
}

/** How many of one product are in the cart. `0` while storage is unread. */
export function useCartQty(slug: string): number {
  const lines = useCartLines();
  return lines?.find((line) => line.slug === slug)?.qty ?? 0;
}
