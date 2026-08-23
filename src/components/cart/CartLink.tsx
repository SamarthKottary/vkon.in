"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CartIcon } from "@/components/icons/ui";
import {
  cartCount,
  getCartServerSnapshot,
  getCartSnapshot,
  parseCart,
  subscribeCart,
} from "@/lib/cart";

/**
 * The header's cart link and its count.
 *
 * `useSyncExternalStore` rather than `useEffect` + `setState`: `localStorage`
 * is exactly the external store that hook exists for, and it is also what the
 * `react-hooks/set-state-in-effect` rule pushes towards. The subscription
 * covers this tab as well as others — see the note in `lib/cart.ts` on why
 * `storage` alone is not enough for a cart.
 *
 * **The badge is absent until storage has been read**, not zero. `raw` is
 * `null` through the server render and hydration, and rendering a "0" for
 * that frame would flash an empty cart at someone who has three things in
 * theirs. The link itself always renders, so nothing shifts when the count
 * arrives — only the badge appears.
 */
export function CartLink({ className = "" }: { className?: string }) {
  const raw = useSyncExternalStore<string | null>(
    subscribeCart,
    getCartSnapshot,
    getCartServerSnapshot,
  );

  const count = raw === null ? null : cartCount(parseCart(raw));

  return (
    <Link
      href="/cart"
      aria-label={
        count && count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"
      }
      className={`relative inline-flex h-11 w-11 items-center justify-center text-ink transition-colors hover:text-accent ${className}`}
    >
      <CartIcon className="h-5 w-5" />
      {count !== null && count > 0 && (
        /* `tabular-nums` so the badge does not jitter in width as the count
           moves between 1 and 2 digits. */
        <span className="absolute right-1 top-1 min-w-[1.125rem] rounded-full bg-accent px-1 text-center font-mono text-[0.625rem] leading-[1.125rem] tabular-nums text-surface">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
