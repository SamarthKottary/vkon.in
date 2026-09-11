"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { Field, fieldInput } from "@/components/ui/Field";
import { INDIAN_STATES } from "@/content/states";
import {
  saveAddressAction,
  type AccountState,
} from "@/app/(site)/account/private-actions";
import type { Address } from "@/lib/types";

/**
 * Add or edit a delivery address.
 *
 * One component for both, distinguished by a hidden `id`. The alternative —
 * two forms with the same eight fields — is two places to fix a validation
 * message, and the action already treats them as one operation.
 *
 * **The state is a `<select>`, not a text input.** GST depends on the delivery
 * state (see the note in `lib/pricing.ts`), and "Karnatka", "KA" and
 * "karnataka" typed into a free field are three states as far as any later
 * tax logic is concerned. It is also the only field here somebody is likely to
 * abbreviate. Every value is re-checked server-side regardless — a `<select>`
 * is a convenience, not a control, and §7 says so.
 */
export function AddressForm({
  address,
  onDone,
}: {
  address?: Address;
  /** Called after a successful save, so the page can close the form. */
  onDone?: () => void;
}) {
  const uid = useId();
  const [state, formAction] = useActionState<AccountState, FormData>(saveAddressAction, {
    status: "idle",
  });
  /**
   * Tells the parent the save succeeded, so it can close this form.
   *
   * **This has to be an effect, and the shape it replaced was a real bug.**
   * Calling `onDone()` from the render body sets state on the *parent* while
   * this component is rendering, which React rejects outright: "Cannot update
   * a component while rendering a different component". Setting one's own
   * state during render is the legal pattern that shape borrows from; reaching
   * up to somebody else's is not.
   *
   * `state.status` is the only dependency and settles at "ok", so this fires
   * exactly once per successful save. The callback goes through a ref because
   * the parent passes an inline arrow — a fresh identity every render, which
   * as a dependency would re-run this on every render instead.
   */
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => {
    if (state.status === "ok") onDoneRef.current?.();
  }, [state.status]);

  const error = (field: string) => state.fieldErrors?.[field];
  /**
   * What to put in a field: what was last typed, else what is being edited,
   * else nothing.
   *
   * React 19 resets an uncontrolled form once its action resolves, so without
   * the first term a single rejected PIN code blanks the other eight boxes and
   * the whole address has to be typed again. `AccountState.values` exists for
   * exactly this and the action fills it on every error return; this is the
   * end of the wire that reads it.
   */
  const value = (field: keyof Address) =>
    state.values?.[field] ?? (address ? String(address[field] ?? "") : "");

  return (
    <form action={formAction} className="space-y-5">
      {address && <input type="hidden" name="id" value={address.id} />}

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
        <Field id={`${uid}-name`} label="Deliver to" error={error("name")} required>
          <input
            id={`${uid}-name`}
            name="name"
            defaultValue={value("name")}
            autoComplete="name"
            required
            maxLength={120}
            className={fieldInput(error("name"))}
          />
        </Field>

        <Field id={`${uid}-phone`} label="Phone" error={error("phone")} required>
          <input
            id={`${uid}-phone`}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={value("phone")}
            required
            maxLength={40}
            className={fieldInput(error("phone"))}
          />
        </Field>
      </div>

      <Field
        id={`${uid}-line1`}
        label="Address"
        hint="House or shop number, street or village."
        error={error("line1")}
        required
      >
        <input
          id={`${uid}-line1`}
          name="line1"
          defaultValue={value("line1")}
          autoComplete="address-line1"
          required
          maxLength={200}
          className={fieldInput(error("line1"))}
        />
      </Field>

      <Field id={`${uid}-line2`} label="Landmark or area" optional error={error("line2")}>
        <input
          id={`${uid}-line2`}
          name="line2"
          defaultValue={value("line2")}
          autoComplete="address-line2"
          maxLength={200}
          className={fieldInput(error("line2"))}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field id={`${uid}-city`} label="Town or city" error={error("city")} required>
          <input
            id={`${uid}-city`}
            name="city"
            defaultValue={value("city")}
            autoComplete="address-level2"
            required
            maxLength={80}
            className={fieldInput(error("city"))}
          />
        </Field>

        <Field id={`${uid}-state`} label="State" error={error("state")} required>
          <select
            id={`${uid}-state`}
            name="state"
            defaultValue={value("state") || "Karnataka"}
            required
            className={fieldInput(error("state"))}
          >
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field id={`${uid}-pin`} label="PIN code" error={error("postalCode")} required>
          <input
            id={`${uid}-pin`}
            name="postalCode"
            autoComplete="postal-code"
            defaultValue={value("postalCode")}
            required
            maxLength={10}
            className={fieldInput(error("postalCode"))}
          />
        </Field>
      </div>

      {/* Optional, and last, because almost nobody has one -- a required-looking
          box for a registration number is the sort of thing that stops a
          farmer's order dead. It lives on the address rather than the account
          because a GSTIN belongs to a registered place of business: the same
          person can order to a firm's premises against its GSTIN one week and
          to their home the next. */}
      <Field
        id={`${uid}-gstin`}
        label="GSTIN"
        hint="If you are buying in a business's name, we will print this on the tax invoice."
        error={error("gstin")}
        optional
      >
        <input
          id={`${uid}-gstin`}
          name="gstin"
          defaultValue={value("gstin")}
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          placeholder="29AAGCB7383J1Z4"
          /* `uppercase` is presentation only -- the action upper-cases what it
             is sent regardless, because CSS is not a validator and this box is
             reachable without this page. */
          className={`${fieldInput(error("gstin"))} uppercase placeholder:normal-case`}
        />
      </Field>

      <label className="flex items-center gap-3 text-sm text-body">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.isDefault}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
        Use this as my default address
      </label>

      <Save editing={Boolean(address)} />
    </form>
  );
}

function Save({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Saving…" : editing ? "Save changes" : "Save address"}
    </Button>

  );
}
