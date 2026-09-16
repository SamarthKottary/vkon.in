"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/PasswordField";
import { resetPasswordAction, type AuthState } from "@/app/(site)/account/actions";

/**
 * Choose a new password.
 *
 * **The token travels in a hidden field, not in the action's closure.** It is
 * already in the URL that got here, so putting it in the form adds no
 * exposure, and it means the action validates the same value on every attempt
 * — including the second attempt after a password that was too short.
 *
 * There is no success branch: the action redirects to `/account?reset=1`, so a
 * successful reset leaves this page rather than rendering a message on it.
 */
export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(resetPasswordAction, {
    status: "idle",
  });

  const error = state.fieldErrors?.password;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      {state.status === "error" && state.message && !error && (
        <p
          role="alert"
          className="flex items-start gap-2 border-l-2 border-red-600 bg-surface-subtle px-4 py-3 text-sm text-red-700"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {state.message}
        </p>
      )}

      <PasswordField
        label="New password"
        error={error}
        autoFocus
        confirm
        confirmLabel="Confirm new password"
        confirmError={state.fieldErrors?.confirmPassword}
      />

      <Save />

      <p className="text-sm leading-relaxed text-muted">
        Setting a new password signs you out on every other device.
      </p>
    </form>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="lg" sweep className="w-full">
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Saving…" : "Save my new password"}
    </Button>
  );
}
