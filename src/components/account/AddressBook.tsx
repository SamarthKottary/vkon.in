"use client";

import { useOptimistic, useState, useTransition } from "react";
import { PencilIcon, PinIcon, PlusIcon, TrashIcon } from "@/components/icons/ui";
import { AddressForm } from "@/components/account/AddressForm";
import { AddressDialog } from "@/components/account/AddressPicker";
import {
  deleteAddressAction,
  setDefaultAddressAction,
} from "@/app/(site)/account/private-actions";
import type { Address } from "@/lib/types";

/**
 * The saved addresses, every one of them on screen.
 *
 * **A grid of cards, not checkout's collapsed picker** (client, 2026-09-18:
 * "revert the address section in users my account page to how it was before
 * … only the my account page and not the checkout"). The two pages want
 * opposite things from the same list: checkout is about getting past the
 * addresses to the order, so it shows one and hides the rest; this page *is*
 * the addresses, and hiding them behind a dropdown put a click in front of the
 * only thing here.
 *
 * One list, used for both jobs: checkout picks a billing address and a shipping
 * address out of it rather than keeping two books. An address book with a
 * "billing" section and a "delivery" section makes the customer file the same
 * street twice and keep both up to date, and the distinction only exists at the
 * moment of ordering anyway — which is where it is asked.
 *
 * **What the radio chooses is the default.** There is no order to choose an
 * address for here, and the one choice an address book has is which address
 * checkout starts from — so picking a card makes it the default, which is what
 * the separate "Make default" button used to do. (The cards had a radio before
 * that too, and it chose nothing: it only highlighted a card.)
 *
 * **Editing and adding open `AddressDialog`**, the same pop-up checkout uses,
 * rather than the inline panel this page once had: a form unfolding in the
 * middle of the page pushed everything below it down, and the same form in two
 * places is two places to fix a field.
 *
 * The cards come from the page as a prop, and every mutation goes back through
 * an action that re-reads them, so what is on screen after a save is the
 * database's answer. The one exception is the radio while "make default" is in
 * flight: `useOptimistic` moves it at once and falls back to the prop when the
 * action settles, so a failed save puts it back rather than leaving a guess on
 * screen. The default-address rule itself stays transactional, in
 * `lib/db/addresses.ts`.
 */
export function AddressBook({ addresses }: { addresses: Address[] }) {
  const defaultId = addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "";
  const [shownDefault, showDefault] = useOptimistic(defaultId);
  const [, startTransition] = useTransition();

  /** Which address the dialog is open on: an id, "new", or closed. */
  const [editing, setEditing] = useState<string | null>(null);
  const editingAddress = addresses.find((a) => a.id === editing);

  const makeDefault = (id: string) => {
    if (id === defaultId) return;
    startTransition(async () => {
      showDefault(id);
      const form = new FormData();
      form.set("id", id);
      await setDefaultAddressAction(form);
    });
  };

  const dialog = editing !== null && (
    <AddressDialog
      key={editing}
      address={editingAddress}
      onDone={() => setEditing(null)}
      onCancel={() => setEditing(null)}
    />
  );

  if (addresses.length === 0) {
    /* Nothing saved yet, so the form is the section — as at checkout. No
       Cancel: there is nowhere to go back to. */
    return (
      <div className="max-w-2xl border border-line-strong bg-surface-raised p-5 shadow-card sm:p-6">
        <AddressForm />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dialog}

      <ul className="grid gap-4 sm:grid-cols-2">
        {addresses.map((address) => {
          const isDefault = shownDefault === address.id;
          return (
            <li key={address.id} className="min-w-0">
              <div
                className={`flex h-full flex-col border bg-surface-raised transition-colors ${
                  isDefault ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong"
                }`}
              >
                {/* The label covers the radio and the address only. Wrapping
                    the buttons in it too would make Edit change the default on
                    its way through — a label forwards its click to its
                    control. */}
                <label className="flex flex-1 cursor-pointer gap-3 p-4 sm:p-5">
                  <input
                    type="radio"
                    name="account-default-address"
                    value={address.id}
                    checked={isDefault}
                    onChange={() => makeDefault(address.id)}
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

                    {/* Only when there is one. A "GSTIN —" row on the eight
                        cards out of ten that have none is eight rows of
                        nothing. */}
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
                    onClick={() => setEditing(address.id)}
                    className="flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                    Edit
                  </button>

                  <form
                    action={deleteAddressAction}
                    /* A plain `confirm()`, as everywhere else an address is
                       deleted. It is recoverable by typing it again. */
                    onSubmit={(event) => {
                      if (!window.confirm(`Delete the address for ${address.name}?`)) {
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

      <button
        type="button"
        onClick={() => setEditing("new")}
        className="inline-flex h-11 items-center gap-2 border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
      >
        <PlusIcon className="h-4 w-4" />
        Add an address
      </button>
    </div>
  );
}
