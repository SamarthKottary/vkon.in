"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { Field, fieldInput } from "@/components/ui/Field";
import {
  cancelSignInAction,
  resendSignInCodeAction,
  verifySignInCodeAction,
  type AuthState,
} from "@/app/(site)/account/actions";

/**
 * The six-digit code that finishes a sign-in.
 *
 * Two actions on one screen, each with its own `useActionState` so that asking
 * for a new code cannot clear the error from a wrong one, and vice versa. The
 * "use a different account" control is a third form: it is a state change, not
 * a link, so it must be a POST.
 *
 * Nothing here knows which account is waiting — the server reads that from the
 * signed pending cookie. The page is handed only the address to display, so a
 * tampered field cannot point the code at somebody else.
 */
export function CodeForm({ email }: { email: string }) {
  const uid = useId();
  const [state, verify] = useActionState<AuthState, FormData>(verifySignInCodeAction, {
    status: "idle",
  });
  const [resent, resend] = useActionState<AuthState, FormData>(resendSignInCodeAction, {
    status: "idle",
  });

  return (
    <div className="space-y-5">
      <form action={verify} className="space-y-5">
        {state.status === "error" && state.message && (
          <p
            role="alert"
            className="flex items-start gap-2 border-l-2 border-red-600 bg-surface-subtle px-4 py-3 text-sm text-red-700"
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {state.message}
          </p>
        )}

        <Field id={`${uid}-code`} label="Six-digit code" required>
          <input
            id={`${uid}-code`}
            name="code"
            /* `inputMode` and `autoComplete` together are what make a phone
               offer the code straight from the notification instead of making
               somebody switch apps to read it. `type="text"`, not `number`:
               a number field drops leading zeros and shows a spinner. */
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            className={`${fieldInput()} text-center font-mono text-2xl tracking-[0.5em]`}
          />
        </Field>

        <Verify />
      </form>

      {resent.message && (
        <p
          role="status"
          className={`flex items-start gap-2 text-sm ${
            resent.status === "ok" ? "text-accent" : "text-red-700"
          }`}
        >
          {resent.status === "ok" ? (
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {resent.message}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-sm">
        <form action={resend}>
          <Resend />
        </form>

        <form action={cancelSignInAction}>
          <button type="submit" className="text-muted underline-offset-4 hover:text-ink hover:underline">
            Use a different account
          </button>
        </form>
      </div>

      <p className="text-sm leading-relaxed text-muted">
        Sent to <span className="font-medium text-ink">{email}</span>. It can
        take a minute to arrive — check your spam folder if it does not.
      </p>
    </div>
  );
}

function Verify() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="lg" sweep className="w-full">
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Checking…" : "Sign in"}
    </Button>
  );
}

function Resend() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-accent underline-offset-4 hover:underline disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send a new code"}
    </button>
  );
}
