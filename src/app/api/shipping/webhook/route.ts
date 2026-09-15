import { NextResponse, type NextRequest } from "next/server";
import { applyShipmentUpdate } from "@/lib/db/orders";
import { mapShipmentStatus, verifyShippingWebhook } from "@/lib/shiprocket";

/**
 * Shiprocket tells us a parcel moved.
 *
 * **There is no session here, and there must not be.** Shiprocket's servers
 * are the caller; there is no cookie and no signed-in customer. The shared
 * secret in `x-api-key` *is* the authentication, exactly as the Razorpay
 * webhook's signature is — see `verifyShippingWebhook` for why that is weaker
 * than a signature and why it is nonetheless what gets used.
 *
 * **A request we cannot make sense of still gets a 200.** Same rule as the
 * payment webhook, for the same reason: a 4xx makes the sender retry for hours
 * over something that will never resolve — an AWB for an order that is not
 * ours, a status word we do not map. The only 4xx here is a failed
 * authentication, which *should* be retried after the secret is corrected.
 *
 * Unconfigured is a supported state: with no `SHIPROCKET_WEBHOOK_TOKEN` set,
 * every request fails authentication and nothing can be moved by a stranger
 * who guesses the URL.
 */
export const dynamic = "force-dynamic";

type ShipmentEvent = {
  awb?: unknown;
  current_status?: unknown;
  courier_name?: unknown;
};

export async function POST(request: NextRequest) {
  if (!verifyShippingWebhook(request.headers.get("x-api-key"))) {
    /* Deliberately terse: a caller that failed authentication learns nothing
       about whether the token was close, or whether one is configured. */
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let events: ShipmentEvent[];
  try {
    const body: unknown = await request.json();
    /* Shiprocket posts a single object for one shipment and an array when it
       batches. Both shapes are normalised here so the loop below is the only
       code that has to be right. */
    events = Array.isArray(body) ? (body as ShipmentEvent[]) : [body as ShipmentEvent];
  } catch {
    console.error("[shipping] webhook body was not JSON");
    return NextResponse.json({ ok: true });
  }

  for (const event of events.slice(0, 50)) {
    const awb = typeof event?.awb === "string" ? event.awb.trim() : "";
    const current = typeof event?.current_status === "string" ? event.current_status : "";
    if (!awb) continue;

    const status = mapShipmentStatus(current);
    const courierName = typeof event?.courier_name === "string" ? event.courier_name : null;

    try {
      /* `applyShipmentUpdate` reports whether this call actually moved the
         row. Couriers redeliver webhooks by design, so the boolean is what
         separates a real transition from a repeat — and is where a
         "your order has shipped" mail would hook in when one is written. */
      const moved = await applyShipmentUpdate({ awb, status, courierName });
      if (!moved) {
        console.info("[shipping] no change for AWB", awb, `(${current || "no status"})`);
      }
    } catch (error) {
      /* Logged, not raised: one bad row in a batch must not cost the others,
         and Shiprocket would retry the whole batch. */
      console.error("[shipping] update failed for AWB", awb, error);
    }
  }

  return NextResponse.json({ ok: true });
}
