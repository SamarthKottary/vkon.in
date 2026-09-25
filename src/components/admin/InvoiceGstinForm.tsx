"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { Field, fieldInput } from "@/components/ui/Field";
import { saveInvoiceGstinAction, type ProfileState } from "@/app/admin/profile/actions";

/**
 * The business's GST number, on `/admin/profile` and only for a super user
 * (client, 2026-09-25).
 *
 * One number for the whole business rather than for this operator, which is
 * why it sits in its own card under "Your details" and why the action checks
 * the role again: it is printed on every invoice a customer downloads.
 */
export function InvoiceGstinForm({ gstin }: { gstin: string }) {
  const uid = useId();
  const [state, formAction] = useActionState<ProfileState, FormData>(saveInvoiceGstinAction, {
    status: "idle",
  });

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

      <Field
        id={`${uid}-gstin`}
        label="GST number"
        error={state.fieldErrors?.gstin}
        hint="Printed on the invoices customers download. Leave empty to print none."
      >
        <input
          id={`${uid}-gstin`}
          name="gstin"
          defaultValue={state.values?.gstin ?? gstin}
          placeholder="29ABCDE1234F1Z5"
          maxLength={15}
          spellCheck={false}
          autoComplete="off"
          className={`${fieldInput(state.fieldErrors?.gstin)} font-mono uppercase`}
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
