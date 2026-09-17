"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDownIcon,
  CloseIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons/ui";
import { AddressForm } from "@/components/account/AddressForm";
import { deleteAddressAction } from "@/app/(site)/account/private-actions";
import type { Address } from "@/lib/types";

/**
 * The chosen address, collapsed, with the rest of the address book one click
 * away. Used by checkout, where "chosen" is the billing or shipping address,
 * and by the account page's `AddressBook`, where it is the default.
 *
 * **Why collapsed** (client, 2026-09-17, with a reference checkout): checkout
 * used to lay every saved address out as a card, twice — once for billing,
 * once for shipping — so somebody with five addresses scrolled past ten cards
 * to reach the order. Nearly everyone keeps the address that is already
 * selected, so that is all the page shows until asked.
 *
 * **Open, it is only the addresses.** No "Choose an address" header row above
 * them (client, same day): the chevron that opened the list moves onto the
 * first row, in the same place, and closes it.
 *
 * **One text column, open or closed.** Every row — the closed one, each
 * address, "Use a different address" — has the same `px-4`, a 16px leading
 * slot (pin, radio or plus) and a `gap-3`, so names, addresses, Edit/Delete
 * and the add link all start at one x, and that x is the step heading's text
 * above the box. Opening the list does not shift the chosen address sideways.
 *
 * **Choosing closes it.** Picking an address is the whole reason to open the
 * list, so the list goes away the moment that is done, including when the
 * address picked is the one already selected.
 *
 * **The default address is listed first**, then the rest newest first as
 * `listAddresses` returns them (client, 2026-09-17). Sorted here rather than in
 * the query so the account page's address book keeps its own order.
 *
 * **Edit and Delete sit under each address, not behind a "⋮" menu.** The
 * reference hides them in one; the client asked for them visible, and then
 * below the address rather than beside it. They are outside the row's
 * `<label>`, because a label forwards its click to its radio and an Edit button
 * inside one would also change the selection on the way through.
 */
export function AddressPicker({
  addresses,
  selectedId,
  group,
  onSelect,
  onEdit,
  onAdd,
  addLabel = "Use a different address",
  showGstin = false,
}: {
  addresses: Address[];
  selectedId: string;
  /** Radio group name. Must differ between the billing and shipping pickers. */
  group: string;
  onSelect: (id: string) => void;
  onEdit: (address: Address) => void;
  onAdd: () => void;
  /** The link at the foot of the open list. */
  addLabel?: string;
  showGstin?: boolean;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const selected = addresses.find((a) => a.id === selectedId) ?? null;
  /* `sort` is stable, so everything after the default keeps the order it came
     in. Copied first: `addresses` is a prop. */
  const ordered = [...addresses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));

  /**
   * The open and the closed state each render their own toggle, so the one
   * that was pressed is gone by the next paint and focus would fall back to
   * `<body>`. This hands it to the toggle that replaced it — but only after a
   * toggle, never on first render, which would pull focus into checkout the
   * moment the page loads.
   */
  const toggleRef = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);
  const setOpenAndFocus = (next: boolean) => {
    moveFocus.current = true;
    setOpen(next);
  };
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    toggleRef.current?.focus();
  }, [open]);

  /* Same box, same place, open or closed: 8px in from the top-right corner,
     40px square, so the chevron is centred on the first line of the name. */
  const chevronBox = "absolute right-2 top-2 flex h-10 w-10 items-center justify-center";

  if (!open) {
    return (
      <div className="border border-line bg-surface-raised shadow-card">
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setOpenAndFocus(true)}
          aria-expanded={false}
          aria-controls={listId}
          className="relative flex w-full items-start gap-3 py-4 pl-4 pr-12 text-left transition-colors hover:bg-surface-subtle"
        >
          <PinIcon className="mt-1 h-4 w-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            {selected ? (
              <AddressLines address={selected} showGstin={showGstin} />
            ) : (
              <span className="block text-sm text-muted">Choose an address</span>
            )}
          </span>
          <span aria-hidden className={`${chevronBox} text-muted`}>
            <ChevronDownIcon className="h-5 w-5" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div id={listId} className="relative border border-line bg-surface-raised shadow-card">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpenAndFocus(false)}
        aria-expanded
        aria-controls={listId}
        className={`${chevronBox} z-10 text-muted transition-colors hover:text-ink`}
      >
        <ChevronDownIcon className="h-5 w-5 rotate-180" />
        <span className="sr-only">Close the address list</span>
      </button>

      <ul className="divide-y divide-line">
        {ordered.map((address, index) => {
          const isSelected = address.id === selectedId;
          return (
            <li
              key={address.id}
              className={`py-4 pl-4 transition-colors ${
                /* The first row makes room for the close chevron. */
                index === 0 ? "pr-12" : "pr-4"
              } ${isSelected ? "bg-accent-soft/50" : "hover:bg-surface-subtle"}`}
            >
              <label className="flex min-w-0 cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name={group}
                  value={address.id}
                  checked={isSelected}
                  onChange={() => {
                    onSelect(address.id);
                    setOpenAndFocus(false);
                  }}
                  /* `onChange` does not fire for the radio that is already
                     checked, so re-choosing the current address would
                     otherwise leave the list open. */
                  onClick={() => {
                    if (isSelected) setOpenAndFocus(false);
                  }}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1">
                  <AddressLines address={address} showGstin={showGstin} withPhone />
                </span>
              </label>

              {/* `pl-7` is the radio's 16px plus the 12px gap: the buttons
                  start where the name does. */}
              <div className="mt-2.5 flex items-center gap-5 pl-7 text-sm">
                <button
                  type="button"
                  onClick={() => onEdit(address)}
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
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => {
          setOpenAndFocus(false);
          onAdd();
        }}
        className="flex w-full items-center gap-3 border-t border-line px-4 py-3.5 text-left text-sm font-medium text-accent transition-colors hover:bg-surface-subtle"
      >
        <PlusIcon className="h-4 w-4 shrink-0" />
        {addLabel}
      </button>
    </div>
  );
}

function AddressLines({
  address,
  showGstin,
  withPhone = false,
}: {
  address: Address;
  showGstin: boolean;
  withPhone?: boolean;
}) {
  return (
    <>
      {/* `min-h-6` holds the name line at 24px whether or not the pill is on
          it, so the radio, pin and chevron centred on that line stay centred. */}
      <span className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold leading-6 text-ink">{address.name}</span>
        {address.isDefault && (
          <span className="label-tech rounded-full bg-surface-subtle px-2 py-0.5 text-[0.65rem] leading-none text-muted">
            Default
          </span>
        )}
      </span>
      <span className="mt-1 block text-sm leading-relaxed text-body">
        {address.line1}
        {address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state}{" "}
        {address.postalCode}
      </span>
      {withPhone && address.phone && (
        <span className="mt-0.5 block text-sm text-muted">{address.phone}</span>
      )}
      {showGstin && address.gstin && (
        <span className="label-tech mt-2 block break-all text-muted">GSTIN {address.gstin}</span>
      )}
    </>
  );
}

/**
 * Adding or editing an address, in a dialog over checkout rather than as a
 * form that opens in the middle of the page and pushes the order down.
 *
 * Portalled to `<body>`, which also keeps its `<form>` out of the order form's
 * DOM — the nested-form trap `CheckoutForm` records at length.
 *
 * **`onDone` and `onCancel` are different on purpose.** Saving a *new* address
 * has to leave `CheckoutForm`'s "select what was just added" marker in place
 * so the new row becomes the selection when it arrives; cancelling has to
 * clear it. One `onClose` for both lost that.
 *
 * The callbacks are held in refs so the one-time setup below — focus, scroll
 * lock, Escape — runs once. Keyed on the callbacks, it re-ran every time
 * checkout re-rendered behind the dialog (a delivery quote landing, say), and
 * each re-run pulled focus back to the panel out of the field being typed in.
 */
export function AddressDialog({
  address,
  onDone,
  onCancel,
}: {
  address?: Address;
  onDone: () => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onCancelRef.current = onCancel;
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancelRef.current();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-6">
      {/* Blur only, no tint (client, 2026-09-17). A `bg-ink/50` wash is dark
          in the light theme but *light* in the dark one — `ink` is the text
          colour, and in dark mode that is near-white — so it brightened the
          page behind the dialog. */}
      <div
        aria-hidden
        onClick={() => onCancelRef.current()}
        className="absolute inset-0 backdrop-blur-md"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        tabIndex={-1}
        /* Sized to fit a laptop viewport with no scroll bar (client,
           2026-09-17): wide enough for `AddressForm`'s compact rows, which put
           it near 560px tall. `overflow-y-auto` stays as the fallback for a
           window shorter than that, and for a phone, where the form is one
           column and a sheet that scrolls is expected. */
        className="relative max-h-[92svh] w-full max-w-2xl overflow-y-auto border border-line-strong bg-surface-raised p-5 shadow-2xl outline-none sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={`${uid}-title`} className="text-xl font-semibold text-ink">
            {address ? "Edit address" : "New address"}
          </h2>
          <button
            type="button"
            onClick={() => onCancelRef.current()}
            className="flex h-10 w-10 items-center justify-center text-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <AddressForm
          key={address?.id ?? "new"}
          compact
          address={address}
          onDone={() => onDoneRef.current()}
          onCancel={() => onCancelRef.current()}
        />
      </div>
    </div>,
    document.body,
  );
}
