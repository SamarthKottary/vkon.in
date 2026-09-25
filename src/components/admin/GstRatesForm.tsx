"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { Field, fieldInput } from "@/components/ui/Field";
import { saveGstRatesAction, type ProfileState } from "@/app/admin/profile/actions";
import type { GstRates } from "@/lib/pricing";

/**
 * The CGST and SGST percentages, on `/admin/profile` and only for a super user
 * (client, 2026-09-25).
 *
 * Saving these changes every price on the site at once — they are shown on
 * top of each product's price and charged on every order placed afterwards —
 * so the card says so plainly rather than looking like a preference.
 */
export function GstRatesForm({ rates }: { rates: GstRates }) {
  const uid = useId();
  const [state, formAction] = useActionState<ProfileState, FormData>(saveGstRatesAction, {
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

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${uid}-cgst`} label="CGST %" error={state.fieldErrors?.cgst} required>
          <input
            id={`${uid}-cgst`}
            name="cgst"
            inputMode="decimal"
            defaultValue={state.values?.cgst ?? String(rates.cgst)}
            required
            maxLength={5}
            className={`${fieldInput(state.fieldErrors?.cgst)} tabular-nums`}
          />
        </Field>

        <Field id={`${uid}-sgst`} label="SGST %" error={state.fieldErrors?.sgst} required>
          <input
            id={`${uid}-sgst`}
            name="sgst"
            inputMode="decimal"
            defaultValue={state.values?.sgst ?? String(rates.sgst)}
            required
            maxLength={5}
            className={`${fieldInput(state.fieldErrors?.sgst)} tabular-nums`}
          />
        </Field>
      </div>

      <p className="text-sm text-muted">
        Shown on top of every product price and charged on every order placed from now on.
        Orders already placed keep what they were charged.
      </p>

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
      {pending ? "Saving…" : "Save rates"}
    </Button>
  );
}
