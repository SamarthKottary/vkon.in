"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TrashIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export function CancelOrderButton({
  orderId,
  compact = false,
  redirectOnDelete = false,
}: {
  orderId: string;
  compact?: boolean;
  redirectOnDelete?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function cancelOrder() {
    setShowConfirm(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "DELETE",
      });

      if (res.ok) {
        if (redirectOnDelete) {
          router.replace("/account/orders");
        } else {
          router.refresh();
        }
      } else {
        alert("Could not delete the order.");
        setBusy(false);
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while deleting the order.");
      setBusy(false);
    }
  }

  const baseClasses =
    "inline-flex items-center justify-center transition-colors disabled:opacity-50";

  const confirmDialog = showConfirm && (
    <Modal title="Delete order" onClose={() => setShowConfirm(false)}>
      <p className="mt-2 text-sm leading-relaxed text-body">
        Are you sure you want to permanently delete this order? This action cannot be undone.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="danger"
          size="lg"
          onClick={cancelOrder}
          className="min-w-36 flex-1 sm:flex-none"
        >
          Delete
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setShowConfirm(false)}
          className="min-w-36 flex-1 sm:flex-none"
        >
          Cancel
        </Button>
      </div>
    </Modal>
  );

  if (compact) {
    return (
      <>
        {confirmDialog}
        <button
          type="button"
          title="Delete order"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowConfirm(true);
          }}
          disabled={busy}
          className={`${baseClasses} h-9 w-9 border border-line-strong text-muted hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30`}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </>
    );
  }

  return (
    <>
      {confirmDialog}
      <button
        type="button"
        title="Delete order"
        onClick={() => setShowConfirm(true)}
        disabled={busy}
        className={`${baseClasses} h-8 w-8 rounded-full text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30`}
      >
        <TrashIcon className="h-5 w-5" />
      </button>
    </>
  );
}
