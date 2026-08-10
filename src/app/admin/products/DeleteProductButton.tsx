"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerIcon, TrashIcon } from "@/components/icons/ui";
import { deleteProductAction } from "../actions";

/**
 * Delete with a typed-free confirmation step.
 *
 * A native `confirm()` is easy to dismiss by reflex; requiring a second,
 * explicitly-labelled click on a destructive-coloured control makes the
 * intent deliberate without being tedious.
 */
export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function arm() {
    setConfirming(true);
    if (timer.current) clearTimeout(timer.current);
    // Reset if they walk away, so a stray click later cannot delete.
    timer.current = setTimeout(() => setConfirming(false), 5000);
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={arm}
        aria-label={`Delete ${name}`}
        className="inline-flex items-center border border-line-strong px-3 py-2 text-sm text-muted hover:border-red-400 hover:text-red-700"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <form action={deleteProductAction} className="flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <ConfirmButton name={name} />
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

function ConfirmButton({ name }: { name: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-red-600 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {pending ? <SpinnerIcon className="h-3.5 w-3.5" /> : <TrashIcon className="h-3.5 w-3.5" />}
      {/* The visible word must lead the accessible name, or voice control
          ("click Confirm delete") cannot reach it. */}
      {pending ? "Deleting…" : "Confirm delete"}
      <span className="sr-only"> {name}</span>
    </button>
  );
}
