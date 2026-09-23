/**
 * Search and paging for the admin lists — orders, enquiries, subscribers and
 * the product search (client, 2026-09-19: "fixed number of emails per page if
 * there are more … it moves to the next page", with a "1–10 of 23 · Previous
 * Next" footer for reference).
 *
 * Everything lives in the URL (`?q=…&page=…&status=…`), read on the server:
 * a filtered page can be bookmarked or refreshed, works with no JavaScript,
 * and each action on the page can send the admin back to the same view.
 */

/** Rows per page on every paged admin list. */
export const PER_PAGE = 10;

export type ListQuery = { q: string; page: number };

/** `?q=` trimmed and bounded, `?page=` a positive whole number (else 1). */
export function readListQuery(params: { q?: string; page?: string }): ListQuery {
  const q = String(params.q ?? "").trim().slice(0, 100);
  const n = Number.parseInt(String(params.page ?? "1"), 10);
  return { q, page: Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : 1 };
}

/** The last page there is, so `?page=9` on a two-page list shows page 2. */
export function clampPage(page: number, total: number): number {
  return Math.max(1, Math.min(page, Math.ceil(total / PER_PAGE) || 1));
}

/**
 * `%text%` for `ILIKE`, with the typed `%`, `_` and `\` matched literally —
 * a search for "50%" must not mean "50 followed by anything". Postgres's
 * default LIKE escape character is the backslash.
 */
export function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * The digits of a search, for matching phone numbers however they were typed
 * or stored ("+91 82170 86719", "08217086719", "8217086719"). Longer than ten
 * keeps the last ten, dropping a country code or trunk zero; fewer than four
 * is not treated as a phone search at all, or "12" would match half the list.
 * `""` means "not a phone search".
 */
export function phoneDigits(q: string): string {
  const digits = q.replace(/\D/g, "");
  if (digits.length < 4) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** A list's query string (no `?`) with only the parts that are set; page 1
 *  is left implicit. */
export function listSearch(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || (key === "page" && Number(value) <= 1)) continue;
    search.set(key, String(value));
  }
  return search.toString();
}

/** A list URL with only the parts that are set. */
export function listHref(path: string, params: Record<string, string | number | undefined>): string {
  const qs = listSearch(params);
  return qs ? `${path}?${qs}` : path;
}

/**
 * The view a form on a list was posted from — its hidden `view` field, e.g.
 * `q=ravi&status=pending&page=2` — so the action can send the admin back to
 * the same search, filter and page instead of page 1.
 *
 * Read key by key and rebuilt, never used as a URL: only `q`, `page`,
 * `status` and `sort` survive, so a forged field can neither redirect
 * elsewhere nor smuggle in an outcome message ("refunded=…"). The page
 * re-validates all four when it renders.
 */
export function returnView(value: FormDataEntryValue | null): string {
  const raw = new URLSearchParams(typeof value === "string" ? value : "");
  const { q, page } = readListQuery({ q: raw.get("q") ?? "", page: raw.get("page") ?? "" });
  /* Letters and hyphens: the filter values are `pending-cod`,
     `refund-cancelled` and the like. Anything else is dropped, so the field
     can neither redirect elsewhere nor smuggle in another parameter. */
  const status = (raw.get("status") ?? "").replace(/[^a-z-]/g, "").slice(0, 24);
  const sort = (raw.get("sort") ?? "").replace(/[^a-z]/g, "").slice(0, 8);
  return listSearch({ q, status, sort, page });
}
