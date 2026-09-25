import { getGstRates } from "@/lib/db/settings";
import { listProducts } from "@/lib/db/products";
import { serviceName, sameServiceIndex } from "@/lib/order-delivery";
import { packParcel } from "@/lib/parcel";
import { formatPaise, repriceOrderItems, totals, type Money, type RepricedLine } from "@/lib/pricing";
import { quoteDelivery, shortlistDeliveryOptions, type DeliveryOption } from "@/lib/shiprocket";
import type { Order } from "@/lib/types";

/**
 * What an unpaid order would cost today: its lines at today's catalogue
 * prices, and delivery at today's courier rate.
 *
 * **One function, called from two places** (2026-09-18): `/api/payment/create`
 * asks it whether the order still costs what it says before taking money, and
 * `updateOrderPricesAction` asks it again to write the new figures when the
 * customer presses Update. Two copies of this would eventually disagree, and
 * the customer would be shown one total and charged another — the failure
 * `lib/pricing.ts` exists to prevent.
 *
 * Server only: it reads the catalogue and calls Shiprocket.
 */
export type OrderPriceNow = {
  lines: RepricedLine[];
  money: Money;
  /** Today's services to this address, for the dialog's courier choice.
   *  Empty when no quote was possible. */
  shippingOptions: DeliveryOption[];
  /** The service the new delivery figure is for; null when no quote was
   *  possible and the order's own delivery charge was kept. */
  delivery: { courierId: number; courierName: string; service: string } | null;
};

export async function priceOrderNow(
  order: Order,
  /** A service the customer picked in the dialog; re-validated against the
   *  fresh quote, so it can only choose among real services at real prices. */
  courierId: number | null,
): Promise<OrderPriceNow> {
  const products = await listProducts();
  /* Every line, not only the ones that moved: the dialog shows the whole
     bill, and an unchanged line is part of it. */
  const { lines } = repriceOrderItems(order.items, products);

  let shipping = order.shipping;
  let shippingOptions: DeliveryOption[] = [];
  let delivery: OrderPriceNow["delivery"] = null;

  /* Delivery is re-quoted too (Nishanth, 2026-09-18): a courier's rate moves
     like a price does. A failed quote keeps the order's own charge rather than
     blocking the payment — charging what the order was placed at is never
     wrong. */
  try {
    const options = await quoteDelivery({
      deliveryPincode: order.shipTo.postalCode,
      parcel: packParcel(lines, products),
      declaredValuePaise: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      isCOD: false,
    });
    shippingOptions = shortlistDeliveryOptions(options);

    if (shippingOptions.length > 0) {
      /* The customer's pick, else the courier the order already has, else the
         same *service* it had — "Express" stays Express even when a different
         courier is now the quick one. */
      const index = (() => {
        const picked = courierId !== null ? shippingOptions.findIndex((o) => o.courierId === courierId) : -1;
        if (picked >= 0) return picked;
        const current =
          order.courierId !== null ? shippingOptions.findIndex((o) => o.courierId === order.courierId) : -1;
        if (current >= 0) return current;
        return sameServiceIndex(order.deliveryService, shippingOptions.length);
      })();
      const chosen = shippingOptions[index];
      shipping = chosen.ratePaise;
      delivery = {
        courierId: chosen.courierId,
        courierName: chosen.courierName,
        service: serviceName(index, shippingOptions.length),
      };
    }
  } catch (error) {
    console.error("[reprice] delivery re-quote failed:", error);
  }

  return { lines, money: totals(lines, shipping, await getGstRates()), shippingOptions, delivery };
}

/**
 * The 409 body `PayNowButton`'s dialog is drawn from: the whole bill, then and
 * now — "the total is now X" without the tax and delivery it is made of is
 * not enough for somebody to check it against.
 */
export function priceChangeBody(order: Order, now: OrderPriceNow) {
  return {
    error: "price_changed" as const,
    message: `Prices have changed since this order was placed. The total is now ${formatPaise(now.money.total)}.`,
    orderNumber: order.orderNumber,
    previousTotal: order.total,
    newTotal: now.money.total,
    previous: {
      subtotal: order.subtotal,
      cgst: order.cgst,
      sgst: order.sgst,
      shipping: order.shipping,
      total: order.total,
    },
    next: now.money,
    shippingOptions: now.shippingOptions,
    currentCourierId: now.delivery?.courierId ?? order.courierId,
    lines: now.lines.map((line) => ({
      name: line.name,
      qty: line.qty,
      wasUnitPrice: line.wasUnitPrice,
      unitPrice: line.unitPrice,
      wasLineTotal: line.wasUnitPrice * line.qty,
      lineTotal: line.lineTotal,
      unavailable: line.unavailable,
    })),
  };
}

export type PriceChangeBody = ReturnType<typeof priceChangeBody>;
