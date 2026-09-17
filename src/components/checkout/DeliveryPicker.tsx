"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/icons/ui";
import { formatPaise } from "@/lib/pricing";
import type { DeliveryOption } from "@/lib/shiprocket";

/**
 * The delivery service, collapsed to the one chosen, with the others a click
 * away — the same pattern as `AddressPicker`, in the summary panel above
 * "Payment method" (client, 2026-09-17, with a reference checkout).
 *
 * **A dropdown only when there is a choice.** One service on offer is not a
 * decision the customer can make, so it shows as a plain line; so do
 * "Calculating…" and the phone-call wording. The box is there in every state
 * and the same height in each, so a quote landing does not push Pay Now down
 * the panel.
 *
 * Unlike the address picker, the open list keeps its "Delivery" header row: the
 * reference does, and here the label is what says what the prices below it
 * are for.
 *
 * It renders inside the order `<form>`. That is safe because nothing here is a
 * form or a submit button: the radios' `name` only groups them — the server
 * reads the chosen service from `CheckoutForm`'s hidden `courierId` input.
 */
export function DeliveryPicker({
  options,
  chosenId,
  onChoose,
  group,
}: {
  /** `null` while the quote is still being fetched. */
  options: DeliveryOption[] | null;
  chosenId: number | null;
  onChoose: (courierId: number) => void;
  group: string;
}) {
  const [open, setOpen] = useState(false);

  /* As in `AddressPicker`: the toggle pressed is replaced by another, so focus
     is handed across — after a toggle only, never on first render. */
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

  const chosenIndex = options ? options.findIndex((o) => o.courierId === chosenId) : -1;
  const chosen = options?.[chosenIndex] ?? null;
  const choosable = options !== null && options.length > 1;

  const row = "flex w-full items-center gap-3 px-4 py-3 text-left text-sm";
  const label = <span className="w-16 shrink-0 text-muted">Delivery</span>;

  if (!choosable || !open) {
    const value =
      options === null ? (
        <span className="text-muted">Calculating…</span>
      ) : options.length === 0 ? (
        <span className="text-ink">Quoted on our call</span>
      ) : (
        <span className="font-semibold text-ink">
          {chosen
            ? `${summary(chosen, chosenIndex, options.length)} · ${formatPaise(chosen.ratePaise)}`
            : "Choose a service"}
        </span>
      );

    return choosable ? (
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpenAndFocus(true)}
        aria-expanded={false}
        className={`${row} border border-line transition-colors hover:border-line-strong`}
      >
        {label}
        <span className="min-w-0 flex-1 truncate">{value}</span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted" />
      </button>
    ) : (
      <div className={`${row} border border-line`}>
        {label}
        <span className="min-w-0 flex-1 truncate">{value}</span>
      </div>
    );
  }

  return (
    <div className="border border-line">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpenAndFocus(false)}
        aria-expanded
        className={`${row} justify-between transition-colors hover:bg-surface-subtle`}
      >
        {label}
        <ChevronDownIcon className="h-4 w-4 shrink-0 rotate-180 text-muted" />
      </button>

      <ul className="border-t border-line">
        {options.map((option, index) => {
          const selected = option.courierId === chosenId;
          return (
            <li key={option.courierId}>
              <label
                className={`flex cursor-pointer items-start gap-3 px-4 py-3 text-sm transition-colors ${
                  selected ? "bg-accent-soft/50" : "hover:bg-surface-subtle"
                }`}
              >
                <input
                  type="radio"
                  name={group}
                  checked={selected}
                  onChange={() => {
                    onChoose(option.courierId);
                    setOpenAndFocus(false);
                  }}
                  /* `onChange` does not fire for the radio already checked. */
                  onClick={() => {
                    if (selected) setOpenAndFocus(false);
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-ink">
                      {serviceName(index, options.length)}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink">
                      {formatPaise(option.ratePaise)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">
                    {option.estimatedDays
                      ? `~${option.estimatedDays} days · ${option.courierName}`
                      : option.courierName}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Standard, ~3 days" — the closed row's name for a service. */
function summary(option: DeliveryOption, index: number, count: number): string {
  const name = serviceName(index, count);
  return option.estimatedDays ? `${name}, ~${option.estimatedDays} days` : name;
}

/**
 * What a delivery service is called: by its place in the shortlist, never by
 * whether it flies. `shortlistDeliveryOptions` returns them cheapest first and
 * each strictly quicker than the one before, so position *is* speed.
 *
 * Shiprocket's air/surface flag is not. Labelled from it, a Mangaluru order
 * offered "Express, ~2 days" for ₹49.72 above "Standard, ~1 day" for ₹73.44 —
 * Xpressbees by air against Blue Dart by road — and a Delhi one showed two
 * different services both called "Standard".
 */
function serviceName(index: number, count: number): string {
  if (index === 0) return "Standard";
  return index === count - 1 ? "Express" : "Faster";
}
