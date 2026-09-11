"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { Field, Honeypot, fieldInput } from "@/components/ui/Field";
import { forgotPasswordAction, type AuthState } from "@/app/(site)/account/actions";

/**
 * Ask for a reset link.
 *
 * The confirmation deliberately says the same thing whether or not an account
 * exists — see the note at the top of `account/actions.ts`. A page that
 * answered honestly would tell any stranger which of the addresses they typed
 * belong to this business's customers.
 */
export function ForgotForm() {
  const uid = useId();
  const [state, formAction] = useActionState<AuthState, FormData>(forgotPasswordAction, {
    status: "idle",
  });

  if (state.status === "ok") {
    return (
      <div
        role="status"
        className="flex items-start gap-4 border border-accent bg-accent-soft px-5 py-5"
      >
        <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <p className="font-medium text-ink">{state.message}</p>
          <p className="mt-2 text-sm leading-relaxed text-body">
            It can take a minute to arrive. Check your spam folder if it does
            not.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="flex items-start gap-2 border-l-2 border-red-600 bg-surface-subtle px-4 py-3 text-sm text-red-700"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {state.message}
        </p>
      )}

      <Field id={`${uid}-email`} label="Email" required>
        <input
          id={`${uid}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          /* Restored after an error: React 19 resets the form when the action
             resolves. See the note on `AuthState.values`. */
          defaultValue={state.values?.email ?? ""}
          className={fieldInput()}
        />
      </Field>

      <Honeypot />
      <Send />
    </form>
  );
}

function Send() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="lg" sweep className="w-full">
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Sending…" : "Send me a link"}
    </Button>
  );
}
