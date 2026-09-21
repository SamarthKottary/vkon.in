"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldInput } from "@/components/ui/Field";
import { resetAdminPasswordAction } from "../forgot/actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, isPending] = useActionState(resetAdminPasswordAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />

      <Field
        id="password"
        label="New password"
        error={state.fieldErrors?.password}
        className="mb-6"
      >
        <input
          id="password"
          type="password"
          name="password"
          required
          autoComplete="new-password"
          autoFocus
          className={fieldInput(state.fieldErrors?.password)}
        />
      </Field>

      <Field
        id="confirmPassword"
        label="Confirm new password"
        error={state.fieldErrors?.confirmPassword}
        className="mb-6"
      >
        <input
          id="confirmPassword"
          type="password"
          name="confirmPassword"
          required
          autoComplete="new-password"
          className={fieldInput(state.fieldErrors?.confirmPassword)}
        />
      </Field>

      {state.error && (
        <p className="mb-6 text-sm font-medium text-red-600">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving..." : "Set new password"}
      </Button>
    </form>
  );
}
