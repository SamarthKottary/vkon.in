"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckIcon, SpinnerIcon, TrashIcon } from "@/components/icons/ui";
import { deleteEnquiryAction, setEnquiryHandledAction } from "../actions";

/**
 * Mark handled / reopen, and delete.
 *
 * Delete is behind the same two-step confirmation as products and subscribers —
 * an enquiry is somebody's request and there is no undo. Marking handled is
 * one click, because it is reversible.
 */
export function EnquiryActions({
  id,
  name,
  handled,
}: {
  id: string;
  name: string;
  handled: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <form action={setEnquiryHandledAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="handled" value={handled ? "0" : "1"} />
        <HandledButton handled={handled} name={name} />
      </form>
      <DeleteButton id={id} name={name} />
    </div>
  );
}

function HandledButton({ handled, name }: { handled: boolean; name: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center gap-1.5 border px-3 py-2 text-sm disabled:opacity-50 ${
        handled
          ? "border-line-strong text-muted hover:border-ink hover:text-ink"
          : "border-accent text-accent hover:bg-accent-soft"
      }`}
    >
      {pending ? (
        <SpinnerIcon className="h-3.5 w-3.5" />
      ) : (
        <CheckIcon className="h-3.5 w-3.5" />
      )}
      {handled ? "Reopen" : "Mark handled"}
      <span className="sr-only"> — {name}</span>
    </button>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
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
        aria-label={`Delete enquiry from ${name}`}
        className="inline-flex items-center border border-line-strong px-3 py-2 text-sm text-muted hover:border-red-400 hover:text-red-700"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <form action={deleteEnquiryAction} className="flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <ConfirmDelete name={name} />
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

function ConfirmDelete({ name }: { name: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-red-600 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {pending ? (
        <SpinnerIcon className="h-3.5 w-3.5" />
      ) : (
        <TrashIcon className="h-3.5 w-3.5" />
      )}
      {/* Visible word first, so voice control can reach it. */}
      {pending ? "Deleting…" : "Confirm delete"}
      <span className="sr-only"> — enquiry from {name}</span>
    </button>
  );
}
