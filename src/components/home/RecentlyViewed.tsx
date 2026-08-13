"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ProductCard } from "@/components/product/ProductCard";
import {
  getRecentServerSnapshot,
  getRecentSnapshot,
  parseRecent,
  subscribeRecent,
} from "@/lib/recent";
import type { Product } from "@/lib/types";

/** Never more than a row's worth, however many are remembered. */
const SHOWN = 6;

/**
 * "Recently viewed", read from the visitor's own browser.
 *
 * `useSyncExternalStore` rather than `useEffect` + `setState`. localStorage is
 * exactly what that hook is for — an external store the server cannot see — and
 * it is also what the lint rule `react-hooks/set-state-in-effect` pushes you
 * towards. `getServerSnapshot` returns an empty string, so the server renders
 * nothing and hydration matches; the real value arrives on the first client
 * render after that.
 *
 * The snapshot is the raw string, not a parsed array: returning a fresh array
 * from `getSnapshot` would be a new reference every call and re-render forever.
 * Parsing happens in the `useMemo` below.
 *
 * `products` is the live published catalogue. Stored slugs are resolved against
 * it, so anything renamed, unpublished or deleted drops out on its own rather
 * than linking to a 404.
 */
export function RecentlyViewed({ products }: { products: Product[] }) {
  const raw = useSyncExternalStore(
    subscribeRecent,
    getRecentSnapshot,
    getRecentServerSnapshot,
  );

  const recent = useMemo(() => {
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    return parseRecent(raw)
      .map((slug) => bySlug.get(slug))
      .filter((p): p is Product => Boolean(p))
      .slice(0, SHOWN);
  }, [raw, products]);

  if (recent.length === 0) return null;

  return (
    <section className="border-t border-line py-14 sm:py-16">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8">
        <h2 className="text-xl leading-snug sm:text-2xl">Recently viewed</h2>
        <p className="mt-2 text-sm text-muted">
          Kept on this device only — nothing is sent to us.
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} orientation="horizontal" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
