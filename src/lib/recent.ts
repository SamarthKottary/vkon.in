/**
 * Recently viewed products, kept in the visitor's own browser.
 *
 * No account, no cookie, no server: this is `localStorage` on the device, so
 * nothing about who viewed what leaves the machine and there is nothing to
 * consent to. It follows that the list does not travel between a phone and a
 * desktop, which is the correct trade for a feature this small.
 *
 * **Slugs are stored, never product data.** Caching names and images here would
 * mean a product that is later renamed, unpublished or deleted keeps showing
 * its old self and links to a 404. Storing only slugs lets the page resolve
 * them against the live catalogue and silently drop anything that no longer
 * exists.
 */

const KEY = "vkon-recent";

/** Kept slightly above the six shown, so removing one still fills the row. */
const MAX_STORED = 12;

/**
 * Raw stored value, for `useSyncExternalStore`.
 *
 * It returns the *string*, not a parsed array, and that matters: the snapshot
 * has to be referentially stable or React re-renders forever. Parsing belongs
 * in a `useMemo` on the value this returns.
 */
export function getRecentSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** Server render has no storage, so the section starts empty and fills in. */
export function getRecentServerSnapshot(): string {
  return "";
}

export function subscribeRecent(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // `storage` fires in *other* tabs. Same-tab writes happen on the product
  // page, which is a different document, so this is enough.
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function parseRecent(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .slice(0, MAX_STORED);
  } catch {
    return [];
  }
}

export function readRecent(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .slice(0, MAX_STORED);
  } catch {
    // Private mode, a full quota, or someone else's key holding junk. A
    // browsing convenience is never worth throwing over.
    return [];
  }
}

/** Moves `slug` to the front, de-duplicating so revisits reorder rather than repeat. */
export function recordRecent(slug: string): void {
  if (typeof window === "undefined" || !slug) return;

  try {
    const next = [slug, ...readRecent().filter((s) => s !== slug)].slice(
      0,
      MAX_STORED,
    );
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // As above — storage being unavailable must not break the page.
  }
}
