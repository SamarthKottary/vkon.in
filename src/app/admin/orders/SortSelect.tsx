"use client";

import { useRouter } from "next/navigation";
import { listHref } from "@/lib/admin-list";

/**
 * Newest or oldest first on the order list (client, 2026-09-23).
 *
 * A `<select>` that navigates on change — the same shape as
 * `OrderStatusSelect`, and a GET `<form>` underneath it so the dropdown still
 * works with no JavaScript (the `<noscript>` button submits it). `router.push`
 * rather than a form submit when there is JavaScript, so choosing **Default
 * order** leaves the URL clean instead of `?sort=`.
 *
 * The value is re-validated on the page against the two it knows; anything
 * else is the default order. Nothing here is a control.
 */

const OPTIONS: { value: "" | "newest" | "oldest"; label: string }[] = [
  { value: "", label: "Default order" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

export function SortSelect({
  path,
  sort,
  keep = {},
}: {
  path: string;
  sort: "" | "newest" | "oldest";
  /** The rest of the view — the search and the status filter — kept when the
   *  order changes. */
  keep?: Record<string, string>;
}) {
  const router = useRouter();

  return (
    <form action={path} className="mt-3 flex items-center gap-2">
      {Object.entries(keep).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      {/* The label is for screen readers only: a visible "Sort" pushed the
          dropdown off the filter chips' left edge, and the choices name
          themselves. */}
      <label htmlFor="orders-sort" className="sr-only">
        Sort orders
      </label>
      <select
        id="orders-sort"
        name="sort"
        /* Uncontrolled, keyed on the chosen order: the dropdown keeps what was
           picked while the page loads instead of snapping back, and a Back
           button that changes the order remounts it onto the right one. */
        key={sort}
        defaultValue={sort}
        onChange={(event) => router.push(listHref(path, { ...keep, sort: event.currentTarget.value }))}
        className="h-9 border border-line-strong bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="h-9 border border-line-strong px-3 text-sm text-ink">
          Go
        </button>
      </noscript>
    </form>
  );
}
