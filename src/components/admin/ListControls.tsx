import Link from "next/link";
import { PER_PAGE, listHref } from "@/lib/admin-list";

/**
 * The search box and the page footer shared by the admin lists (2026-09-19).
 *
 * Both are plain HTML — a GET form and links — so they work before any
 * JavaScript arrives, and the view lives in the URL. The search is the same
 * shape as the one already on /admin/users.
 */
export function ListSearch({
  path,
  q,
  placeholder,
  label,
  keep = {},
}: {
  path: string;
  q: string;
  placeholder: string;
  /** Screen-reader label, e.g. "Search orders". */
  label: string;
  /** Other parts of the view to keep when searching, e.g. the status filter. */
  keep?: Record<string, string>;
}) {
  const id = `search-${path.replace(/\W+/g, "-")}`;
  return (
    <form action={path} role="search" className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      {Object.entries(keep).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        className="h-10 min-w-0 flex-1 border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink sm:w-72"
      />
      <button
        type="submit"
        className="h-10 border border-line-strong px-4 text-sm font-medium text-ink hover:border-ink hover:bg-surface-subtle"
      >
        Search
      </button>
      {q && (
        <Link href={listHref(path, keep)} className="h-10 px-2 text-sm leading-10 text-accent hover:underline">
          Clear
        </Link>
      )}
    </form>
  );
}

/**
 * "1–10 of 23" on the left, Previous and Next on the right — the client's
 * reference. Nothing at all when the list is empty.
 */
export function ListPager({
  path,
  page,
  total,
  keep = {},
}: {
  path: string;
  page: number;
  total: number;
  keep?: Record<string, string>;
}) {
  if (total === 0) return null;
  const from = (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);
  const last = Math.ceil(total / PER_PAGE);
  const button = "inline-flex h-9 items-center border px-3 text-sm font-medium";
  const live = `${button} border-line-strong text-ink hover:border-ink hover:bg-surface-subtle`;
  const dead = `${button} cursor-not-allowed border-line text-muted opacity-60`;

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="text-sm tabular-nums text-muted">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={listHref(path, { ...keep, page: page - 1 })} className={live} rel="prev">
            Previous
          </Link>
        ) : (
          <span aria-disabled className={dead}>
            Previous
          </span>
        )}
        {page < last ? (
          <Link href={listHref(path, { ...keep, page: page + 1 })} className={live} rel="next">
            Next
          </Link>
        ) : (
          <span aria-disabled className={dead}>
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
