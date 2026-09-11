"use client";

import { useState } from "react";
import { PencilIcon, PinIcon, PlusIcon, TrashIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { AddressForm } from "@/components/account/AddressForm";
import {
  deleteAddressAction,
  setDefaultAddressAction,
} from "@/app/(site)/account/private-actions";
import type { Address } from "@/lib/types";

/**
 * The saved addresses, with add and edit forms opening in place.
 *
 * One list, used for both jobs: checkout picks a billing address and a shipping
 * address out of it rather than keeping two books. An address book with a
 * "billing" section and a "delivery" section makes the customer file the same
 * street twice and keep both up to date, and the distinction only exists at the
 * moment of ordering anyway — which is where it is asked.
 *
 * A client component only because "which card is being edited" is local state
 * that no server needs to know. The rows themselves come from the page as a
 * prop, and every mutation goes back through an action that re-reads them —
 * so what is on screen after a save is the database's answer, not this
 * component's guess at it. That is deliberate: an optimistic list here would
 * be a second copy of the default-address rule, which is transactional and
 * lives in `lib/db/addresses.ts`.
 */
export function AddressBook({ addresses }: { addresses: Address[] }) {
  const [adding, setAdding] = useState(addresses.length === 0);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {addresses.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2">
          {addresses.map((address) => (
            <li
              key={address.id}
              className={`border bg-surface-raised p-5 shadow-card ${
                address.isDefault ? "border-accent" : "border-line"
              }`}
            >
              {editing === address.id ? (
                <>
                  <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-ink">
                    Edit address
                  </h3>
                  <AddressForm address={address} onDone={() => setEditing(null)} />
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="mt-4 text-sm text-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {address.isDefault && (
                    <p className="label-tech mb-3 flex items-center gap-1.5 text-accent">
                      <PinIcon className="h-3.5 w-3.5" />
                      Default
                    </p>
                  )}

                  <p className="font-semibold text-ink">{address.name}</p>
                  <address className="mt-1.5 text-sm not-italic leading-relaxed text-body">
                    {address.line1}
                    {address.line2 && (
                      <>
                        <br />
                        {address.line2}
                      </>
                    )}
                    <br />
                    {address.city}, {address.state} {address.postalCode}
                    <br />
                    {address.phone}
                  </address>

                  {/* Only when there is one. A "GSTIN —" row on the eight cards
                      out of ten that have none is eight rows of nothing. */}
                  {address.gstin && (
                    <p className="label-tech mt-3 break-all text-muted">
                      GSTIN {address.gstin}
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(address.id);
                        setAdding(false);
                      }}
                      className="flex items-center gap-1.5 text-accent hover:underline"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                      Edit
                    </button>

                    {!address.isDefault && (
                      <form action={setDefaultAddressAction}>
                        <input type="hidden" name="id" value={address.id} />
                        <button type="submit" className="text-muted hover:text-ink">
                          Make default
                        </button>
                      </form>
                    )}

                    <form
                      action={deleteAddressAction}
                      /* A plain `confirm()`. The admin's delete uses a two-step
                         button for the same job; this is a saved address rather
                         than a catalogue row, and the browser dialog is one
                         fewer piece of state to hold. Deleting one is also
                         entirely recoverable by typing it again. */
                      onSubmit={(event) => {
                        if (!window.confirm("Delete this address?")) {
                          event.preventDefault();
                        }
                      }}
                      className="ml-auto"
                    >
                      <input type="hidden" name="id" value={address.id} />
                      <button
                        type="submit"
                        className="flex items-center gap-1.5 text-muted hover:text-red-700"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </form>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="border border-line bg-surface-raised p-6 shadow-card sm:p-8">
          <h3 className="mb-6 text-sm font-semibold uppercase tracking-wider text-ink">
            New address
          </h3>
          <AddressForm onDone={() => setAdding(false)} />
          {addresses.length > 0 && (
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="mt-4 text-sm text-muted hover:text-ink"
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setAdding(true)}>
          <PlusIcon className="h-4 w-4" />
          Add an address
        </Button>
      )}
    </div>
  );
}
