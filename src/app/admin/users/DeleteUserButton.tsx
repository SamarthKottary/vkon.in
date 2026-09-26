"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerIcon, TrashIcon } from "@/components/icons/ui";
import { deleteCustomerAction } from "@/app/admin/actions";

/**
 * Delete an account, in two clicks (client, 2026-09-26).
 *
 * The same arm-then-confirm as `DeleteProductButton`, for the same reason: a
 * native `confirm()` is dismissed by reflex, while a second click on a control
 * that has changed colour and now says what it will do is deliberate. It arms
 * for five seconds and disarms itself, so a trash icon left armed in an open
 * tab cannot be finished off by a stray click later.
 *
 * This is the one irreversible control on the page — a red icon among plain
 * ones, and the only one restricted to super users.
 */
export function DeleteUserButton({
  id,
  name,
  q,
  filter,
  disabled,
}: {
  id: string;
  /** For the accessible name — the row's icon carries no visible label. */
  name: string;
  q: string;
  filter: string;
  disabled?: boolean;
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
        disabled={disabled}
        title={disabled ? "Only super users can delete an account" : `Delete ${name}`}
        aria-label={`Delete ${name}`}
        className="inline-flex h-9 items-center px-2 text-red-600 transition-colors hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <TrashIcon className="h-[1.1rem] w-[1.1rem]" />
      </button>
    );
  }

  return (
    <form action={deleteCustomerAction} className="flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="q" value={q} />
      <input type="hidden" name="filter" value={filter} />
      <ConfirmButton name={name} />
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="h-9 px-2 text-sm text-muted transition-colors hover:text-ink"
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
      className="inline-flex h-9 items-center gap-1.5 border border-red-600 bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
    >
      {pending ? <SpinnerIcon className="h-4 w-4" /> : <TrashIcon className="h-4 w-4" />}
      {/* The visible word leads the accessible name, or voice control
          ("click Delete everything") cannot reach it. */}
      {pending ? "Deleting…" : "Delete everything"}
      <span className="sr-only"> belonging to {name}</span>
    </button>
  );
}
