"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { Field, fieldInput } from "@/components/ui/Field";
import { PasswordField } from "@/components/ui/PasswordField";
import { setAdminPasswordAction, type ProfileState } from "@/app/admin/profile/actions";

/**
 * Set or change the admin user's password.
 *
 * Collapsed behind a button — open only when needed, like the customer version.
 * No "Forgot password?" link: admin accounts are managed by the super user.
 */
export function AdminPasswordCard({ hasPassword, role }: { hasPassword: boolean, role: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ProfileState, FormData>(
    setAdminPasswordAction,
    { status: "idle" },
  );

  const done = state.status === "ok";

  return (
    <div className="border-t border-line pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">Password</h3>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
            {hasPassword
              ? "You can sign in with your email address and password."
              : "Set a password to sign in with your email address."}
          </p>
        </div>

        {!open && !done && (
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            {hasPassword ? "Change password" : "Set a password"}
          </Button>
        )}
      </div>

      {done && (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 border border-accent bg-accent-soft px-4 py-3 text-sm text-ink"
        >
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          {state.message}
        </p>
      )}

      {open && !done && (
        <form action={formAction} className="mt-5 max-w-md space-y-5">
          {state.status === "error" && state.message && (
            <p
              role="alert"
              className="flex items-start gap-2 border-l-2 border-red-600 bg-surface-subtle px-4 py-3 text-sm text-red-700"
            >
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {state.message}
            </p>
          )}

          {hasPassword && (
            <Field
              id={`${uid}-current`}
              label="Current password"
              error={state.fieldErrors?.currentPassword}
              required
            >
              <input
                id={`${uid}-current`}
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={200}
                className={fieldInput(state.fieldErrors?.currentPassword)}
              />
            </Field>
          )}

          <PasswordField
            label={hasPassword ? "New password" : "Password"}
            error={state.fieldErrors?.password}
            confirm
            confirmLabel={hasPassword ? "Confirm new password" : "Confirm password"}
            confirmError={state.fieldErrors?.confirmPassword}
          />

          <div className="flex flex-wrap items-center gap-3">
            <SaveButton label={hasPassword ? "Change password" : "Set password"} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Cancel
            </button>
            {role === "super" && (
              <a
                href="/admin/forgot"
                className="text-sm text-accent underline-offset-4 hover:underline ml-auto"
              >
                Forgot password?
              </a>
            )}
          </div>

          <p className="text-sm leading-relaxed text-muted">
            Saving does not sign you out — you remain on this session.
          </p>
        </form>
      )}
    </div>
  );
}

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Saving…" : label}
    </Button>
  );
}
