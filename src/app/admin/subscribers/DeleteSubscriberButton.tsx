"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerIcon, TrashIcon } from "@/components/icons/ui";
import { deleteSubscriberAction } from "../actions";

/**
 * Remove one address, behind the same two-step confirmation as deleting a
 * product. Someone asking to be taken off a list expects it to happen once;
 * doing it to the wrong row by a stray click is not recoverable.
 */
export function DeleteSubscriberButton({
  id,
  email,
}: {
  id: string;
  email: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function arm() {
    setConfirming(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setConfirming(false), 5000);
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={arm}
        aria-label={`Remove ${email}`}
        className="inline-flex items-center border border-line-strong px-3 py-2 text-sm text-muted hover:border-red-400 hover:text-red-700"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <form action={deleteSubscriberAction} className="flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <ConfirmButton email={email} />
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="px-2 py-2 text-sm text-muted hover:text-ink"
      >
        Cancel
      </button>
    </form>
  );
}

function ConfirmButton({ email }: { email: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-red-600 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {pending ? <SpinnerIcon className="h-3.5 w-3.5" /> : <TrashIcon className="h-3.5 w-3.5" />}
      {/* Visible word first, so voice control can reach it. */}
      {pending ? "Removing…" : "Confirm remove"}
      <span className="sr-only"> {email}</span>
    </button>
  );
}
