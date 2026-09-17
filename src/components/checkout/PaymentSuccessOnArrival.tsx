"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { PaymentSuccessDialog } from "@/components/checkout/PaymentSuccessDialog";

/**
 * The same "Payment successful" dialog, for the customer arriving from
 * checkout (client, 2026-09-18).
 *
 * Checkout redirects here with `?placed=`, and the order page renders this only
 * when that order is actually paid — a cash-on-delivery order arrives the same
 * way and has taken no payment, so it gets the thank-you note and no dialog.
 *
 * Closing strips `?placed=` from the address bar, so reloading or coming back
 * later does not announce a payment again. `replace`, not `push`: the dialog is
 * not a place in history to go Back to.
 */
export function PaymentSuccessOnArrival({
  orderNumber,
  amountLabel,
  email,
}: {
  orderNumber: string;
  amountLabel: string;
  email: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  if (!open) return null;

  return (
    <PaymentSuccessDialog
      orderNumber={orderNumber}
      amountLabel={amountLabel}
      email={email}
      onClose={() => {
        setOpen(false);
        router.replace(pathname, { scroll: false });
      }}
    />
  );
}
