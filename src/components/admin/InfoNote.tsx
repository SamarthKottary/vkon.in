import type { ReactNode } from "react";
import { InfoIcon } from "@/components/icons/ui";

/**
 * The standing explanation on an admin list, folded away behind an info button
 * (client, 2026-09-21: "make it an info button … where it will drop down and
 * show info").
 *
 * These notes are worth reading once and in the way after that — on /admin/orders
 * it was four paragraphs between the search box and the first order. A `<details>`
 * element rather than state: it opens with no JavaScript, the browser handles the
 * keyboard and announces expanded/collapsed itself, and this stays a server
 * component.
 */
export function InfoNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group mt-6 border border-line bg-surface">
      {/* The info mark is the whole affordance, as in the client's reference —
          no chevron. It brightens on hover and while the note is open. */}
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink hover:bg-surface-subtle [&::-webkit-details-marker]:hidden">
        {title}
        <InfoIcon className="h-4 w-4 text-muted transition-colors group-hover:text-ink group-open:text-ink" />
      </summary>
      <div className="space-y-2 border-t border-line px-4 py-3 text-sm text-body">{children}</div>
    </details>
  );
}
