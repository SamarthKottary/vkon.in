"use client";

import { useState, useEffect } from "react";
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
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [selectedId, setSelectedId] = useState<string | null>(
    defaultAddress?.id ?? null
  );
  const [activeId, setActiveId] = useState<string | null>(
    addresses.length === 0 ? "new" : null
  );

  // If the active or selected address gets deleted, update state
  useEffect(() => {
    if (activeId && activeId !== "new" && !addresses.some((a) => a.id === activeId)) {
      setActiveId(null);
    }
    if (selectedId && !addresses.some((a) => a.id === selectedId)) {
      setSelectedId(addresses[0]?.id ?? null);
    }
  }, [addresses, activeId, selectedId]);

  const editingAddress =
    activeId && activeId !== "new"
      ? addresses.find((a) => a.id === activeId)
      : undefined;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (activeId !== null && activeId !== "new") {
      setActiveId(id);
    }
  };

  const handleEdit = (id: string) => {
    setSelectedId(id);
    setActiveId(activeId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {addresses.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => {
            const isSelected = selectedId === address.id;
            const isEditingThis = activeId === address.id;
            return (
              <li key={address.id} className="min-w-0">
                <div
                  className={`flex h-full flex-col border bg-surface-raised transition-colors ${
                    isSelected || isEditingThis
                      ? "border-accent ring-1 ring-accent"
                      : address.isDefault
                      ? "border-accent"
                      : "border-line hover:border-line-strong"
                  }`}
                >
                  <label className="flex flex-1 cursor-pointer gap-3 p-4 sm:p-5">
                    <input
                      type="radio"
                      name="account-addresses"
                      value={address.id}
                      checked={isSelected}
                      onChange={() => handleSelect(address.id)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-ink">{address.name}</span>
                        {address.isDefault && (
                          <span className="label-tech flex items-center gap-1 text-accent">
                            <PinIcon className="h-3 w-3" />
                            Default
                          </span>
                        )}
                      </span>

                      <span className="mt-1 block text-sm leading-relaxed text-body">
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
                      </span>

                      {/* Only when there is one. A "GSTIN —" row on the eight cards
                          out of ten that have none is eight rows of nothing. */}
                      {address.gstin && (
                        <span className="label-tech mt-3 block break-all text-muted">
                          GSTIN {address.gstin}
                        </span>
                      )}
                    </span>
                  </label>

                  <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-sm">
                    <button
                      type="button"
                      onClick={() => handleEdit(address.id)}
                      className="flex items-center gap-1.5 text-accent hover:underline"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                      {isEditingThis ? "Editing" : "Edit"}
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
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {activeId !== null ? (
        <div className="border border-line-strong bg-surface-raised p-5 shadow-card sm:p-6">
          <h3 className="mb-6 text-sm font-semibold uppercase tracking-wider text-ink">
            {editingAddress ? "Edit address" : "New address"}
          </h3>
          <AddressForm
            key={editingAddress?.id ?? "new"}
            address={editingAddress}
            onDone={() => setActiveId(null)}
            onCancel={
              addresses.length > 0 ? () => setActiveId(null) : undefined
            }
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setActiveId("new");
          }}
        >
          <PlusIcon className="h-4 w-4" />
          Add an address
        </Button>
      )}
    </div>
  );
}
