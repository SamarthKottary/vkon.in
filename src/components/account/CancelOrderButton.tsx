"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TrashIcon } from "@/components/icons/ui";

export function CancelOrderButton({
  orderId,
  compact = false,
}: {
  orderId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancelOrder() {
    if (!window.confirm("Are you sure you want to delete this order?")) {
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "DELETE",
      });

      if (res.ok) {
        if (!compact) {
          router.push("/account/orders");
          router.refresh(); // Ensure the list is updated
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

  if (compact) {
    return (
      <button
        type="button"
        title="Delete order"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          cancelOrder();
        }}
        disabled={busy}
        className={`${baseClasses} h-9 w-9 border border-line-strong text-muted hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30`}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      title="Delete order"
      onClick={cancelOrder}
      disabled={busy}
      className={`${baseClasses} h-8 w-8 rounded-full text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30`}
    >
      <TrashIcon className="h-5 w-5" />
    </button>
  );
}
