import { getCurrentCustomer } from "@/lib/account";
import { getOrderForCustomer } from "@/lib/db/orders";
import { getInvoiceGstin } from "@/lib/db/settings";
import { invoiceFilename, renderInvoice } from "@/lib/invoice";
import { isConfirmedOrder } from "@/lib/order-payment";

/**
 * The customer's own invoice, as a PDF (client, 2026-09-25).
 *
 * A route handler rather than a server action because the answer is a file:
 * the browser has to be handed bytes with a filename, which is what
 * `Content-Disposition` does and what an action cannot do.
 *
 * **The order is fetched by id *and* customer id** — `getOrderForCustomer`
 * puts both in the WHERE clause — so an order id guessed or copied from
 * somebody else returns 404, not a stranger's address and telephone number.
 * An order that was never paid for has nothing to invoice, and says so.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const customer = await getCurrentCustomer();
  if (!customer) return new Response("Not signed in.", { status: 401 });

  const { id } = await params;
  const order = await getOrderForCustomer(customer.id, id);
  if (!order) return new Response("No such order.", { status: 404 });
  if (!isConfirmedOrder(order)) {
    return new Response("This order has not been paid for yet.", { status: 409 });
  }

  try {
    const pdf = await renderInvoice(order, {
      gstin: await getInvoiceGstin(),
      email: customer.email,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `attachment; filename="${invoiceFilename(order)}"`,
        /* The order can change — an address edit, a refund — so nobody is
           served yesterday's copy of a tax document. */
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[invoice] could not be drawn:", error);
    return new Response("The invoice could not be prepared.", { status: 500 });
  }
}
