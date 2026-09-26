"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerIcon } from "@/components/icons/ui";
import { setAdminUserPasswordAction } from "@/app/admin/actions";

/**
 * **Set password** on somebody else's account (client, 2026-09-26).
 *
 * Folded away until it is pressed: a row of accounts with a password box open
 * on each one invites typing in the wrong row, and this is the control that
 * hands somebody a way in.
 *
 * The field is `type="password"` with a **Show** toggle, because a super user
 * setting a password for a colleague has to read it back to them — and a
 * password nobody can see is one that gets typed wrong and blamed on the
 * system. `autoComplete="new-password"` keeps the browser from offering the
 * super user's own.
 */
export function SetPasswordForm({ id, name, weak }: { id: string; name: string; weak?: boolean }) {
  const [open, setOpen] = useState(Boolean(weak));
  const [show, setShow] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border border-line-strong bg-surface px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface-subtle"
      >
        Set password
        <span className="sr-only"> for {name}</span>
      </button>
    );
  }

  return (
    <form action={setAdminUserPasswordAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`pw-${id}`} className="sr-only">
        New password for {name}
      </label>
      <input
        id={`pw-${id}`}
        name="password"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        autoFocus
        required
        minLength={8}
        placeholder="New password"
        className="w-44 border border-line-strong bg-surface px-2 py-1 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
      />
      <button
        type="button"
        onClick={() => setShow((value) => !value)}
        className="px-1 text-xs text-muted transition-colors hover:text-ink"
      >
        {show ? "Hide" : "Show"}
      </button>
      <SaveButton />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-1 text-xs text-muted transition-colors hover:text-ink"
      >
        Cancel
      </button>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-accent bg-accent px-3 py-1 text-xs font-medium text-surface transition-colors hover:bg-accent-strong disabled:opacity-60"
    >
      {pending && <SpinnerIcon className="h-3 w-3" />}
      {pending ? "Saving…" : "Save"}
    </button>
  );
}
