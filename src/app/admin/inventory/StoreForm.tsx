"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Badge } from "@/components/ui/Badge";
import { categoryLabel } from "@/content/taxonomy";
import type { GstRates } from "@/lib/pricing";
import type { Store, StorePickup } from "@/lib/types";
import {
  createStoreAction,
  fetchPickupAction,
  updateStoreAction,
  type PickupState,
  type StoreFormState,
} from "./actions";
import { StoreProductPicker, type PickerProduct } from "./StoreProductPicker";

/**
 * A store's address, in the shape Shiprocket holds it (client, 2026-09-26:
 * "fields like in shiprocket to enter address details").
 *
 * **The name is the key, and Fetch is what makes it worth typing.** Shiprocket
 * matches a pickup address by its nickname and nothing else, so the same word
 * that names the store here — Work, Home, Warehouse — is what their API is
 * asked for. Pressing Fetch fills the rest of the form from their record,
 * which means the address a parcel is collected from and the address written
 * here cannot drift apart by a typo.
 *
 * Every field stays editable afterwards, and the form saves without a fetch at
 * all: a store may exist before anybody registers it with the courier, and the
 * form must not be a dead end when Shiprocket is down.
 *
 * **On a new store** the product catalogue is shown inline below the address
 * so the operator can tick what the store holds before saving. Email, Phone
 * and Contact name are required. At least one product must be selected.
 * Saving writes both the store and its products together, then opens the
 * store's own page (client: "after saving he will be directed to
 * vkon.in/admin/inventory/storename").
 *
 * **On an existing store** (edit mode) the product section is not shown here —
 * products are managed directly from the store's own page.
 */
export function StoreForm({
  store,
  products,
  held = [],
  rates,
}: {
  /** The store being edited, or undefined when creating one. */
  store?: Store;
  /** Full catalogue (new store only). */
  products: PickerProduct[];
  /** Products the store already holds (edit mode: shown read-only). */
  held?: PickerProduct[];
  rates: GstRates;
}) {
  const [state, formAction] = useActionState<StoreFormState, FormData>(
    store ? updateStoreAction : createStoreAction,
    {},
  );
  const [pickup, fetchAction] = useActionState<PickupState, FormData>(fetchPickupAction, {
    status: "idle",
  });

  const form = useRef<HTMLFormElement | null>(null);

  /* Products chosen in the picker dialog (new store only). */
  const [picked, setPicked] = useState<string[]>([]);

  /* What the fields hold. Controlled, because Fetch writes into them: an
     uncontrolled form would need the DOM poked at, and the values have to
     survive a failed save anyway. */
  const [values, setValues] = useState(() => ({
    nickname: store?.nickname ?? "",
    contactName: store?.contactName ?? "",
    contactRole: store?.contactRole ?? "",
    phone: store?.phone ?? "",
    email: store?.email ?? "",
    line1: store?.line1 ?? "",
    line2: store?.line2 ?? "",
    city: store?.city ?? "",
    state: store?.state ?? "",
    postalCode: store?.postalCode ?? "",
    country: store?.country ?? "India",
    notes: store?.notes ?? "",
  }));
  const [pickupId, setPickupId] = useState(store?.pickupId ?? "");
  const [fetched, setFetched] = useState(false);
  /* What else Shiprocket holds about the address — returns, hours, GSTIN
     (client, 2026-09-26). Shown as it is and saved with the store; not fields,
     because they are their record and editing them here would be a lie. */
  const [details, setDetails] = useState<StorePickup>(store?.pickup ?? {});

  /* A fetch that found something fills the form. In an effect rather than in
     the handler because the answer arrives with the action's state, not from
     the click. */
  const filled = useRef<string | null>(null);
  useEffect(() => {
    if (pickup.status !== "found" || !pickup.address) return;
    if (filled.current === pickup.address.id) return;
    filled.current = pickup.address.id;
    const address = pickup.address;
    setValues((current) => ({
      ...current,
      nickname: address.nickname,
      contactName: address.contactName,
      /* Their pickup record has no role field (checked against the live
         account, 2026-09-26): a name, a phone, an email, and label fields that
         come back blank. So the role is ours — a fetch offers their tag when
         there is one and this is still empty, and never overwrites what
         somebody typed. */
      contactRole: current.contactRole || address.details?.tag || "",
      phone: address.phone,
      email: address.email,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country || "India",
    }));
    setPickupId(address.id);
    setDetails(address.details ?? {});
    setFetched(true);
  }, [pickup]);

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [key]: value }));
  };

  const field = (name: string) => state.fieldErrors?.[name];
  const input = (name: string) =>
    `mt-2 w-full border bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 ${
      field(name) ? "border-signal-500 focus:border-signal-500 focus:ring-signal-500" : "border-line-strong focus:border-ink focus:ring-ink"
    }`;

  const isNew = !store;
  /* Save is blocked until at least one product is chosen (new store only). */
  const noProductsError = isNew && picked.length === 0;

  return (
    <div className="space-y-6">
      {state.error && (
        <p role="alert" className="flex items-start gap-3 border border-signal-500 bg-surface px-4 py-3 text-sm text-ink">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-signal-500" />
          {state.error}
        </p>
      )}

      {/* One panel, two forms (client, 2026-09-26: "align and fit the new
          store page"). The name and Fetch used to sit in a card of their own
          above a second card of fields, which read as two unrelated steps and
          left the name floating half a panel wide. They are one form now, with
          a rule between the name and the address it fetches.

          Two `<form>` elements all the same: a nested form is invalid HTML,
          and Fetch must not submit the store. */}
      <div className="border border-line bg-surface-raised">
        <form action={fetchAction} className="border-b border-line p-5">
          {/* The same two columns as the address below it (client,
              2026-09-26): the name box lines up with Contact name and the
              button with Phone, so the panel reads as one grid rather than a
              narrow box floating above a wide one. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="store-nickname" className="label-tech block text-muted">
                Address name<span className="text-signal-500"> *</span>
              </label>
              <input
                id="store-nickname"
                name="nickname"
                value={values.nickname}
                onChange={set("nickname")}
                placeholder="Warehouse"
                aria-invalid={Boolean(field("nickname"))}
                aria-describedby="store-nickname-help"
                className={`${input("nickname")} w-full`}
              />
            </div>
            <div className="flex items-end">
              <FetchButton />
            </div>
          </div>
          <p id="store-nickname-help" className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            What this store is called — Work, Home, Warehouse, or a name of your
            own. If Shiprocket already has a pickup address under this name,{" "}
            <span className="font-medium text-ink">Fetch</span> fills the rest in.
          </p>
          {field("nickname") && <p className="mt-2 text-sm text-signal-700">{field("nickname")}</p>}

          {pickup.status === "found" && pickup.address && (
            <p className="mt-3 flex items-start gap-2 text-sm text-accent">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
              Filled in from Shiprocket’s pickup address “{pickup.address.nickname}”.
            </p>
          )}
          {pickup.status !== "idle" && pickup.status !== "found" && pickup.message && (
            <p role="status" className="mt-3 max-w-prose border-l-2 border-signal-500 bg-surface px-3 py-2 text-sm leading-relaxed text-body">
              {pickup.message}
            </p>
          )}

          <PickupDetailList details={details} />
        </form>

      <form action={formAction} ref={form}>
        {store && <input type="hidden" name="id" value={store.id} />}
        <input type="hidden" name="nickname" value={values.nickname} />
        <input type="hidden" name="pickupId" value={pickupId} />
        <input type="hidden" name="fetched" value={fetched ? "1" : "0"} />
        <input type="hidden" name="pickup" value={JSON.stringify(details)} />
        {isNew && <input type="hidden" name="productIds" value={picked.join(",")} />}

        <div className="p-5">
          <h2 className="text-base font-semibold text-ink">Address</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Contact name" name="contactName" error={field("contactName")} required>
              <input name="contactName" value={values.contactName} onChange={set("contactName")} className={input("contactName")} required />
            </Field>
            <Field label="Role" name="contactRole" error={field("contactRole")}>
              <input
                name="contactRole"
                value={values.contactRole}
                onChange={set("contactRole")}
                placeholder="Warehouse manager"
                className={input("contactRole")}
              />
            </Field>
            <Field label="Phone" name="phone" error={field("phone")} required>
              <input name="phone" value={values.phone} onChange={set("phone")} inputMode="tel" className={input("phone")} required />
            </Field>
            <Field label="Email" name="email" error={field("email")} required>
              <input name="email" value={values.email} onChange={set("email")} type="email" className={input("email")} required />
            </Field>
            <Field label="Address" name="line1" error={field("line1")} required className="sm:col-span-2">
              <input name="line1" value={values.line1} onChange={set("line1")} className={input("line1")} />
            </Field>
            <Field label="Address line 2" name="line2" error={field("line2")} className="sm:col-span-2">
              <input name="line2" value={values.line2} onChange={set("line2")} className={input("line2")} />
            </Field>
            <Field label="City" name="city" error={field("city")} required>
              <input name="city" value={values.city} onChange={set("city")} className={input("city")} />
            </Field>
            <Field label="State" name="state" error={field("state")} required>
              <input name="state" value={values.state} onChange={set("state")} className={input("state")} />
            </Field>
            <Field label="PIN code" name="postalCode" error={field("postalCode")} required>
              <input name="postalCode" value={values.postalCode} onChange={set("postalCode")} inputMode="numeric" maxLength={6} className={input("postalCode")} />
            </Field>
            <Field label="Country" name="country" error={field("country")}>
              <input name="country" value={values.country} onChange={set("country")} className={input("country")} />
            </Field>
            <Field label="Notes" name="notes" error={field("notes")} className="sm:col-span-2">
              <textarea name="notes" value={values.notes} onChange={set("notes")} rows={2} className={input("notes")} />
            </Field>
          </div>
        </div>

        {/* ── Products section ──────────────────────────────────────────────
            New store: picker dialog button + chips of what was chosen.
            Edit store: compact read-only list of the products already held
            (client: "in edit page only show selected product"). */}
        <div className="border-t border-line">
          <div className="p-5">
            <h2 className="text-base font-semibold text-ink">
              Products{isNew && <span className="text-signal-500"> *</span>}
            </h2>

            {isNew ? (
              <>
                <p className="mt-1 text-sm text-muted">
                  Open the catalogue, filter by category, and tick what this store holds.
                  At least one product is required before you can save.
                </p>

                {state.fieldErrors?.products && (
                  <p className="mt-2 text-sm text-signal-700">{state.fieldErrors.products}</p>
                )}

                <div className="mt-4">
                  <StoreProductPicker
                    products={products}
                    rates={rates}
                    initialPicked={picked}
                    saveLabel="Confirm selection"
                    onSave={(ids) => setPicked(ids)}
                  />
                </div>

                {/* Product List showing what was picked */}
                {picked.length > 0 && (
                  <ul className="mt-4 border-t border-l border-r border-line">
                    {picked.map((id) => {
                      const p = products.find((x) => x.id === id);
                      if (!p) return null;
                      return (
                        <li
                          key={id}
                          className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface p-4 sm:flex-nowrap sm:gap-4"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                            <div className="relative h-14 w-14 shrink-0 border border-line bg-surface-subtle">
                              {p.image ? (
                                <Image
                                  src={p.image}
                                  alt=""
                                  fill
                                  sizes="3.5rem"
                                  className="object-contain p-1"
                                />
                              ) : (
                                <span className="label-tech flex h-full w-full items-center justify-center text-muted">
                                  —
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate font-medium text-ink">
                                  {p.name}
                                </span>
                                {!p.published && <Badge tone="warn">Draft</Badge>}
                              </div>
                              <p className="label-tech mt-1.5 truncate text-muted">
                                {categoryLabel(p.category)}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPicked((c) => c.filter((x) => x !== id))}
                            className="inline-flex shrink-0 items-center border border-line-strong px-3 py-2 text-sm text-signal-700 hover:border-signal-700 hover:bg-signal-50"
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              /* Edit mode: only the already-held products */
              held.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  No products in this store yet. Add them from the store page.
                </p>
              ) : (
                <ul className="mt-4 border-t border-l border-r border-line">
                  {held.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-3 border-b border-line bg-surface p-4 sm:flex-nowrap sm:gap-4"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                        <div className="relative h-14 w-14 shrink-0 border border-line bg-surface-subtle">
                          {p.image ? (
                            <Image
                              src={p.image}
                              alt=""
                              fill
                              sizes="3.5rem"
                              className="object-contain p-1"
                            />
                          ) : (
                            <span className="label-tech flex h-full w-full items-center justify-center text-muted">
                              —
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium text-ink">
                              {p.name}
                            </span>
                            {!p.published && <Badge tone="warn">Draft</Badge>}
                          </div>
                          <p className="label-tech mt-1.5 truncate text-muted">
                            {categoryLabel(p.category)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-3 border-t border-line p-5">
          {isNew && noProductsError && (
            <p className="w-full text-sm text-signal-700">
              Select at least one product before saving.
            </p>
          )}
          <SaveButton label={store ? "Save changes" : "Save store"} disabled={isNew && noProductsError} />
        </div>
      </form>
      </div>
    </div>
  );
}

/**
 * What Shiprocket holds beyond the postal address (client, 2026-09-26: "fetch
 * store rto role not just his name and phone number").
 *
 * Read-only on purpose: these are settings on their Pickup Addresses screen,
 * and a box here that looked editable would promise something this form cannot
 * do. Blank fields are left out rather than shown empty.
 */
export function PickupDetailList({ details }: { details: StorePickup }) {
  const hours =
    details.openTime && details.closeTime
      ? `${details.openTime} – ${details.closeTime}`
      : details.openTime || details.closeTime || "";
  const rows: [string, string][] = [
    ["Returns to", details.rto ?? ""],
    ["Pickup hours", hours],
    ["Alternate phone", details.alternatePhone ?? ""],
    ["GSTIN", details.gstin ?? ""],
    ["Warehouse code", details.warehouseCode ?? ""],
    ["Kind of place", details.addressType ?? ""],
    ["Instruction", details.instruction ?? ""],
  ].filter(([, value]) => value !== "") as [string, string][];

  if (rows.length === 0 && !details.primary && !details.verified) return null;

  return (
    <dl className="mt-4 grid gap-x-8 gap-y-3 border-t border-line pt-4 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="label-tech text-muted">{label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{value}</dd>
        </div>
      ))}
      {(details.primary || details.verified) && (
        <div className="min-w-0">
          <dt className="label-tech text-muted">At Shiprocket</dt>
          <dd className="mt-0.5 text-sm text-ink">
            {[details.primary ? "Primary pickup point" : "", details.verified ? "Verified" : ""]
              .filter(Boolean)
              .join(" · ")}
          </dd>
        </div>
      )}
    </dl>
  );
}

function Field({
  label,
  name,
  error,
  required,
  className = "",
  children,
}: {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label-tech block text-muted">
        {label}
        {required && <span className="text-signal-500"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-sm text-signal-700">{error}</p>}
    </div>
  );
}

function FetchButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-[2.8125rem] shrink-0 items-center gap-2 border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle disabled:opacity-60"
    >
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Fetching…" : "Fetch"}
    </button>
  );
}

function SaveButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex h-10 items-center gap-2 border border-accent bg-accent px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Saving…" : label}
    </button>
  );
}

