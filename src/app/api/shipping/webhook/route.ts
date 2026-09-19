import { NextResponse, type NextRequest } from "next/server";
import { applyTrackingUpdate } from "@/lib/db/orders";
import { parseShippingWebhookEvent, verifyShippingWebhook } from "@/lib/shiprocket";

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
 * **Every update is recorded; none is emailed** (client, 2026-09-19). The
 * courier's own status, its scan history and its delivery estimate are stored
 * on the order for `/admin/orders` and the customer's order page. Shiprocket
 * itself tells the customer — it has their email and phone from the booking —
 * so the site's own shipped/delivered emails (2026-09-17) were removed.
 *
 * Unconfigured is a supported state: with no `SHIPROCKET_WEBHOOK_TOKEN` set,
 * every request fails authentication and nothing can be moved by a stranger
 * who guesses the URL.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyShippingWebhook(request.headers.get("x-api-key"))) {
    /* Deliberately terse: a caller that failed authentication learns nothing
       about whether the token was close, or whether one is configured. */
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let events: unknown[];
  try {
    const body: unknown = await request.json();
    /* Shiprocket posts a single object for one shipment and an array when it
       batches. Both shapes are normalised here so the loop below is the only
       code that has to be right. */
    events = Array.isArray(body) ? body : [body];
  } catch {
    console.error("[shipping] webhook body was not JSON");
    return NextResponse.json({ ok: true });
  }

  for (const raw of events.slice(0, 50)) {
    const update = parseShippingWebhookEvent(raw);
    if (!update) continue;

    try {
      const change = await applyTrackingUpdate(update);
      if (!change) {
        console.info("[shipping] no order for AWB", update.awb);
        continue;
      }
    } catch (error) {
      /* Logged, not raised: one bad row in a batch must not cost the others,
         and Shiprocket would retry the whole batch. */
      console.error("[shipping] update failed for AWB", update.awb, error);
    }
  }

  return NextResponse.json({ ok: true });
}
