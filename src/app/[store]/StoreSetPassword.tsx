"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, SpinnerIcon } from "@/components/icons/ui";
import { storeSetPasswordAction, type StoreFormState } from "./actions";

/** Choose a password from the emailed link, and be signed in by it. */
export function StoreSetPassword({ slug, token }: { slug: string; token: string }) {
  const [state, action] = useActionState<StoreFormState, FormData>(storeSetPasswordAction, {});

  return (
    <form action={action} className="mt-6 space-y-4 border border-line bg-surface-raised p-6">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="token" value={token} />

      {state.error && (
        <p role="alert" className="flex items-start gap-3 border border-signal-500 bg-surface px-4 py-3 text-sm text-ink">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-signal-500" />
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="store-new" className="label-tech block text-muted">
          New password
        </label>
        <input
          id="store-new"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          autoFocus
          className="mt-2 w-full border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        />
      </div>
      <div>
        <label htmlFor="store-again" className="label-tech block text-muted">
          Again
        </label>
        <input
          id="store-again"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className="mt-2 w-full border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        />
      </div>
      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 border border-accent bg-accent text-sm font-semibold text-surface transition-colors hover:bg-accent-strong disabled:opacity-60"
    >
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Saving…" : "Set password and sign in"}
    </button>
  );
}
