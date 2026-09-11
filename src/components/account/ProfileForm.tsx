"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { Field, fieldInput } from "@/components/ui/Field";
import {
  saveProfileAction,
  type AccountState,
} from "@/app/(site)/account/private-actions";

/**
 * Edit name and phone number.
 */
export function ProfileForm({ name, phone }: { name: string; phone: string }) {
  const uid = useId();
  const [state, formAction] = useActionState<AccountState, FormData>(saveProfileAction, {
    status: "idle",
  });

  const error = (field: string) => state.fieldErrors?.[field];

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

      <Field id={`${uid}-name`} label="Your name" error={error("name")} required>
        <input
          id={`${uid}-name`}
          name="name"
          defaultValue={state.values?.name ?? name}
          autoComplete="name"
          required
          maxLength={120}
          className={fieldInput(error("name"))}
        />
      </Field>

      <Field id={`${uid}-phone`} label="Phone" optional error={error("phone")}>
        <input
          id={`${uid}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={state.values?.phone ?? phone}
          maxLength={40}
          className={fieldInput(error("phone"))}
        />
      </Field>

      <div className="flex items-center gap-4">
        <Save />
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

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}
