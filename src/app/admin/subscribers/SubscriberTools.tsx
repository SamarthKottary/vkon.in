"use client";

import { useRef, useState } from "react";
import { CheckIcon } from "@/components/icons/ui";

/**
 * Getting the list out of here.
 *
 * Two ways, because they serve different jobs: **Copy** puts a comma-separated
 * run of addresses on the clipboard, which is what a mail client's BCC field
 * wants; **CSV** downloads email, date and source, which is what a mailing
 * platform's importer wants.
 *
 * Both are built in the browser from data already on the page — there is no
 * export endpoint, so there is nothing to reach that would hand over the list
 * to someone who is not signed in.
 */
export function SubscriberTools({
  subscribers,
}: {
  subscribers: { email: string; createdAt: string; source: string }[];
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(
        subscribers.map((s) => s.email).join(", "),
      );
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused. Nothing useful to say — the CSV
      // download beside this button does not depend on it.
    }
  }

  function downloadCsv() {
    const rows = [
      ["email", "subscribed", "source"],
      ...subscribers.map((s) => [s.email, s.createdAt, s.source]),
    ];
    // Quote every field and double any quote inside it, so an address or path
    // containing a comma cannot shift the columns.
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `vkon-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (subscribers.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={copyAll}
        className="inline-flex h-10 items-center gap-2 border border-line-strong px-4 text-sm text-ink hover:border-ink"
      >
        {copied && <CheckIcon className="h-4 w-4 text-accent" />}
        {copied ? "Copied" : "Copy addresses"}
      </button>
      <button
        type="button"
        onClick={downloadCsv}
        className="inline-flex h-10 items-center px-4 text-sm text-muted hover:text-ink"
      >
        Download CSV
      </button>
    </div>
  );
}
