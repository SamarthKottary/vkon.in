"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/icons/ui";

/**
 * Email address as a `mailto:` link, with a copy button beside it.
 *
 * The copy button is not a nicety. `mailto:` only does something when the
 * operating system has a mail client registered, which on a desktop browser is
 * often false — anyone reading mail in a Gmail tab clicks the address and
 * nothing happens at all, with no error to explain it. It works on a phone,
 * which is exactly why the failure goes unnoticed.
 *
 * There is no reliable way to detect whether a `mailto:` was handled, so the
 * link stays (it is correct where a client exists) and the copy button covers
 * the case where it silently does nothing.
 */
export function CopyEmail({ email, subject }: { email: string; subject: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin, or permission denied). The address
      // is visible and selectable either way, so fail quietly.
    }
  }

  return (
    <span className="mt-3 block">
      {/* The address sits on its own line and the button below it. Inline, the
          button stole the ~60px that made the address wrap mid-word. */}
      <a
        href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
        className="block font-mono text-sm leading-snug text-ink underline-offset-4 hover:text-accent hover:underline"
      >
        {email}
      </a>

      <button
        type="button"
        onClick={copy}
        className="label-tech mt-3 inline-block border border-line px-2 py-1 text-muted transition-colors hover:border-ink hover:text-ink"
      >
        {copied ? (
          <span className="flex items-center gap-1 text-accent">
            <CheckIcon className="h-3 w-3" />
            Copied
          </span>
        ) : (
          "Copy"
        )}
      </button>
    </span>
  );
}
