import type { Metadata } from "next";
import { isDatabaseConfigured, query } from "./client";
import { pageMetadata } from "@/lib/seo";

/**
 * Per-page SEO overrides for the static routes, edited at /admin/seo.
 *
 * Reads degrade to "no override" when the database is absent or the `page_seo`
 * table has not been migrated yet, so a page always falls back to its built-in
 * metadata rather than erroring. Writes are called only from the authenticated
 * admin action and deliberately do NOT swallow errors — the admin needs to see
 * a failed save.
 */

export type PageSeo = { title: string; description: string };

type PageSeoRow = { path: string; title: string; description: string };

export async function getPageSeo(path: string): Promise<PageSeo | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const rows = await query<PageSeoRow>(
      `SELECT path, title, description FROM page_seo WHERE path = $1 LIMIT 1`,
      [path],
    );
    const row = rows[0];
    return row ? { title: row.title ?? "", description: row.description ?? "" } : null;
  } catch (error) {
    console.error("[db] page_seo read failed:", error);
    return null;
  }
}

/** Every stored override, keyed by path — for the admin editor to prefill. */
export async function listPageSeo(): Promise<Record<string, PageSeo>> {
  if (!isDatabaseConfigured()) return {};
  try {
    const rows = await query<PageSeoRow>(`SELECT path, title, description FROM page_seo`);
    return Object.fromEntries(
      rows.map((r) => [r.path, { title: r.title ?? "", description: r.description ?? "" }]),
    );
  } catch (error) {
    console.error("[db] page_seo list failed:", error);
    return {};
  }
}

export async function upsertPageSeo(
  path: string,
  title: string,
  description: string,
): Promise<void> {
  await query(
    `INSERT INTO page_seo (path, title, description, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (path) DO UPDATE
       SET title = EXCLUDED.title, description = EXCLUDED.description, updated_at = now()`,
    [path, title, description],
  );
}

/**
 * A page's metadata with the admin's stored override laid over its built-in
 * defaults — a blank override field keeps the default. Call this from a
 * static route's `generateMetadata` in place of `pageMetadata`.
 */
export async function resolvePageMetadata(args: {
  title: string;
  description: string;
  path: string;
  images?: string[];
  absoluteTitle?: boolean;
}): Promise<Metadata> {
  const override = await getPageSeo(args.path);
  return pageMetadata({
    ...args,
    title: override?.title || args.title,
    description: override?.description || args.description,
  });
}
