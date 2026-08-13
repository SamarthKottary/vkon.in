"use client";

import { useEffect } from "react";
import { recordRecent } from "@/lib/recent";

/**
 * Records that this product was viewed. Renders nothing.
 *
 * Deliberately a side effect on mount rather than an onClick on every card:
 * a product page can be reached from the catalogue, the category browser, a
 * search result or a shared link, and only the page itself sees all of them.
 */
export function RecordView({ slug }: { slug: string }) {
  useEffect(() => {
    recordRecent(slug);
  }, [slug]);

  return null;
}
