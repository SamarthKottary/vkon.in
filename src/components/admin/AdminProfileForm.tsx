"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { Field, fieldInput } from "@/components/ui/Field";
import { updateAdminProfileAction, type ProfileState } from "@/app/admin/profile/actions";

/**
 * Edit the admin user's display name. Email and role are read-only.
 */
export function AdminProfileForm({ name }: { name: string }) {
  const uid = useId();
  const [state, formAction] = useActionState<ProfileState, FormData>(
    updateAdminProfileAction,
    { status: "idle" },
  );

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

      <Field id={`${uid}-name`} label="Display name" error={state.fieldErrors?.name} required>
        <input
          id={`${uid}-name`}
          name="name"
          defaultValue={state.values?.name ?? name}
          autoComplete="name"
          required
          maxLength={120}
          className={fieldInput(state.fieldErrors?.name)}
        />
      </Field>

      <div className="flex items-center gap-4">
        <SaveButton />
        {state.status === "ok" && (
          <span role="status" className="flex items-center gap-1.5 text-sm text-accent">
            <CheckIcon className="h-4 w-4" />
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}
