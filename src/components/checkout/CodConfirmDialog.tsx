"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/**
 * "Confirm cash on delivery" — the last step before a COD order is placed
 * (client, 2026-09-18).
 *
 * An online order has Razorpay's own window as its moment of commitment; cash
 * on delivery had none, so pressing Place order took an order with money owed
 * at the door and no chance to think again. This is that moment.
 *
 * It states the two things the customer has to agree to: the amount they will
 * hand over, and that it is cash at the door. Cancel is the default — Escape,
 * the backdrop and the X all cancel — and nothing is placed until Confirm.
 *
 * **Laid out as label-and-figure rows**, the same idiom as `PriceChangeDialog`
 * and the order summary, rather than as a figure buried mid-sentence (client,
 * 2026-09-18: "properly align this"). The amount is the one thing being
 * agreed to, so it sits in its own column where the eye can find it.
 *
 * **It does not mention the phone or a delivery call** (same message). It
 * promised a call that nothing in the system actually makes — the courier's
 * habits are the courier's, not ours to commit to — and repeating the number
 * back is not the customer's decision here; the address above already shows it.
 */
export function CodConfirmDialog({
  amountLabel,
  onConfirm,
  onCancel,
}: {
  amountLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title="Confirm cash on delivery" onClose={onCancel}>
      <dl className="text-sm">
        <div className="flex items-baseline gap-4 border-b border-line py-2.5">
          <dt className="min-w-0 flex-1 text-body">To pay at the door</dt>
          <dd className="whitespace-nowrap text-right text-base font-bold tabular-nums text-ink">
            {amountLabel}
          </dd>
        </div>
        <div className="flex items-baseline gap-4 py-2.5">
          <dt className="min-w-0 flex-1 text-body">Charged now</dt>
          <dd className="whitespace-nowrap text-right tabular-nums text-muted">Nothing</dd>
        </div>
      </dl>

      <p className="mt-2 text-sm leading-relaxed text-body">
        Please have the amount ready — the courier may not carry change.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="accent"
          size="lg"
          onClick={onConfirm}
          className="min-w-36 flex-1 sm:flex-none"
        >
          Place order
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onCancel}
          className="min-w-36 flex-1 sm:flex-none"
        >
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
