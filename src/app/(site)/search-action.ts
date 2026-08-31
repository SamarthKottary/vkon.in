"use server";

import { headers } from "next/headers";
import { fuzzySearchProducts, type FuzzySearchResult } from "@/lib/db/products";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Public server action for fuzzy product search.
 *
 * Unlike the write actions in `actions.ts`, this is a read — no honeypot
 * needed. It is still rate-limited because any publicly reachable POST can
 * be hammered, and each call touches the database.
 *
 * Returns products ranked by `pg_trgm` similarity score, or an empty array
 * on failure (same fail-soft pattern as the product reads themselves). The
 * client uses the returned slugs and scores to reorder and augment whatever
 * it already has loaded client-side.
 */

/** 30 queries per minute per caller — generous for interactive search. */
const SEARCH_LIMIT = { limit: 30, windowMs: 60 * 1000 };

export async function fuzzySearchAction(
  queryText: string,
): Promise<FuzzySearchResult[]> {
  const q = (queryText ?? "").trim();
  if (!q || q.length > 200) return [];

  const requestHeaders = await headers();
  const limited = rateLimit(
    `search:${clientKey(requestHeaders)}`,
    SEARCH_LIMIT,
  );
  if (!limited.ok) return [];

  return fuzzySearchProducts(q);
}
