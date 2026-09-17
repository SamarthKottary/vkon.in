"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { Field, fieldInput } from "@/components/ui/Field";
import { PasswordField } from "@/components/ui/PasswordField";
import {
  setPasswordAction,
  type AccountState,
} from "@/app/(site)/account/private-actions";

/**
 * Set a first password, or change an existing one, from the account page.
 *
 * Two audiences in one card, told apart by `hasPassword`:
 *
 *  - Somebody who has only ever used Google has no password to retype, and is
 *    offered one so they can sign in without it. This is the change the client
 *    asked for on 2026-09-16; before it, the only way to get a password onto
 *    such an account was the forgotten-password email.
 *  - Somebody who already has one must retype it, which is what stops a
 *    borrowed signed-in browser being turned into a lasting way in.
 *
 * Collapsed behind a button rather than sitting open, because "Your details"
 * is a form people come to for a phone number, and a password box that is
 * always showing invites being filled in by accident.
 */
export function PasswordCard({ hasGoogle, hasPassword }: { hasGoogle: boolean; hasPassword: boolean }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<AccountState, FormData>(setPasswordAction, {
    status: "idle",
  });

  const done = state.status === "ok";

  return (
    <div className="border-t border-line pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">Password</h3>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
            {hasPassword
              ? "You can sign in with your email address and password."
              : hasGoogle
                ? "This account uses Google to sign in. Set a password and you can use either."
                : "Set a password to sign in with your email address."}
          </p>
        </div>

        {!open && !done && (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button type="button" variant="outline" onClick={() => setOpen(true)}>
              {hasPassword ? "Change password" : "Set a password"}
            </Button>
            <Button href="/account/forgot" variant="ghost">
              Forgot password?
            </Button>
          </div>
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

          {/* Only when there is one to prove. An account that has never had a
              password has nothing to type here, and a disabled box would just
              be a puzzle. */}
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
            <Save label={hasPassword ? "Change password" : "Set password"} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Cancel
            </button>
            <Link
              href="/account/forgot"
              className="ml-auto text-sm text-accent hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <p className="text-sm leading-relaxed text-muted">
            Saving signs you out everywhere else.
          </p>
        </form>
      )}
    </div>
  );
}

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Saving…" : label}
    </Button>
  );
}
