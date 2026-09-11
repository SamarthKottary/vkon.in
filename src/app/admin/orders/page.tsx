import Image from "next/image";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { sameOrderAddress } from "@/components/account/OrderAddress";
import { isAuthenticated } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listAllOrders } from "@/lib/db/orders";
import { formatPaise } from "@/lib/pricing";
import type { Order } from "@/lib/types";
import { OrderStatusSelect } from "./OrderStatusSelect";

export const dynamic = "force-dynamic";

/**
 * The order inbox.
 *
 * **Nothing tells you an order has arrived** — the same gap as
 * `/admin/enquiries`, and the more expensive version of it: an enquiry is a
 * request for a conversation, while an order is a commitment the customer
 * believes has been accepted, and they have an email saying "our team will
 * call you". docs/ADMIN.md §7.8.
 *
 * Payment is built but not live (docs/PAYMENTS.md), so an order arrives
 * `pending` / `unpaid` and is settled on a phone call. That is why the phone
 * number is the most prominent thing on each card after the total.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; error?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/admin");

  const { updated, error } = await searchParams;
  const orders = await listAllOrders();

  /* "Needs action" is pending-or-confirmed, i.e. not yet out of the door and
     not cancelled. Deliberately not "unpaid" — while payment is settled on a
     call, every open order is unpaid and the count would be noise. */
  const open = orders.filter(
    (o) => o.status === "pending" || o.status === "confirmed",
  ).length;

  const revenue = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <Container size="wide">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl">Orders</h1>
          <p className="mt-1 text-sm text-muted">
            {orders.length} total ·{" "}
            {open === 0 ? "none waiting" : `${open} still to fulfil`} ·{" "}
            {formatPaise(revenue)} booked
          </p>
        </div>
      </div>

      {!isDatabaseConfigured() && (
        <div className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm">
          <p className="font-medium text-ink">No database configured</p>
          <p className="mt-1 text-body">
            Set <code className="font-mono text-[0.8125rem]">DATABASE_URL</code> in{" "}
            <code className="font-mono text-[0.8125rem]">.env.local</code> and run{" "}
            <code className="font-mono text-[0.8125rem]">npm run db:setup</code>.
          </p>
        </div>
      )}

      {(updated || error) && (
        <p
          role="status"
          className={`mt-6 border-l-2 bg-surface px-4 py-3 text-sm text-ink ${
            error ? "border-signal-500" : "border-accent"
          }`}
        >
          {error ? "Could not update that order." : "Order updated."}
        </p>
      )}

      <p className="mt-6 border-l-2 border-line-strong px-4 py-3 text-sm text-body">
        <span className="font-medium text-ink">Nothing is emailed to you.</span>{" "}
        An order appears here and nowhere else — the customer gets the
        confirmation, you do not — so this page needs checking through the day.
        Payment is not taken online yet: ring the number on the order to settle
        it and to quote the delivery charge.
      </p>

      <div className="mt-8 space-y-4">
        {orders.length === 0 ? (
          <div className="border border-line bg-surface px-6 py-16 text-center">
            <p className="text-ink">No orders yet.</p>
            <p className="mt-1 text-sm text-muted">
              Orders placed at checkout appear here.
            </p>
          </div>
        ) : (
          orders.map((order) => <OrderCard key={order.id} order={order} />)
        )}
      </div>
    </Container>
  );
}

function OrderCard({ order }: { order: Order }) {
  const settled = order.status === "delivered" || order.status === "cancelled";

  return (
    <article
      className={`border bg-surface p-5 ${
        settled ? "border-line opacity-70" : "border-line-strong"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-base font-semibold tracking-wide text-ink">
              {order.orderNumber}
            </h2>
            <StatusBadge status={order.status} />
            {order.paymentStatus === "paid" ? (
              <Badge tone="brand">Paid</Badge>
            ) : (
              <Badge>Payment due</Badge>
            )}
          </div>
          <p className="label-tech mt-1.5 text-muted">{formatDate(order.createdAt)}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className="text-xl font-bold tabular-nums text-accent">
            {formatPaise(order.total)}
          </p>
          <OrderStatusSelect
            id={order.id}
            status={order.status}
            orderNumber={order.orderNumber}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-6 border-t border-line pt-5 lg:grid-cols-[1fr_18rem]">
        <div>
          <p className="label-tech text-muted">Items</p>
          <ul className="mt-3 space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden border border-line bg-surface-subtle">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt=""
                      fill
                      sizes="3rem"
                      className="object-cover"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-muted">
                      <PanelPlaceholder className="h-5 w-5" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {/* The snapshot from the order, not a live product lookup —
                      a product renamed since must not change what this says
                      was bought. See the note in schema.sql. */}
                  <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                  <p className="text-xs text-muted">
                    {formatPaise(item.unitPrice)} × {item.qty}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                  {formatPaise(item.lineTotal)}
                </p>
              </li>
            ))}
          </ul>

          {order.notes && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="label-tech text-muted">Customer&rsquo;s note</p>
              {/* `whitespace-pre-wrap` so typed line breaks survive; the value
                  is interpolated as text, never as markup. */}
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-body">
                {order.notes}
              </p>
            </div>
          )}
        </div>

        <div>
          <p className="label-tech text-muted">
            {sameOrderAddress(order.billTo, order.shipTo)
              ? "Bill & deliver to"
              : "Deliver to"}
          </p>
          <p className="mt-3 font-medium text-ink">{order.shipTo.name}</p>
          <address className="mt-1 text-sm not-italic leading-relaxed text-body">
            {order.shipTo.line1}
            {order.shipTo.line2 && (
              <>
                <br />
                {order.shipTo.line2}
              </>
            )}
            <br />
            {order.shipTo.city}, {order.shipTo.state} {order.shipTo.postalCode}
          </address>

          {/* Only when it differs. On the great majority of orders the two are
              the same place and repeating it here would push the phone number,
              which is what this card is actually used for, below the fold. */}
          {!sameOrderAddress(order.billTo, order.shipTo) && (
            <div className="mt-4 border-l-2 border-line pl-3">
              <p className="label-tech text-muted">Bill to</p>
              <p className="mt-1.5 font-medium text-ink">{order.billTo.name}</p>
              <address className="mt-1 text-sm not-italic leading-relaxed text-body">
                {order.billTo.line1}
                {order.billTo.line2 && (
                  <>
                    <br />
                    {order.billTo.line2}
                  </>
                )}
                <br />
                {order.billTo.city}, {order.billTo.state} {order.billTo.postalCode}
              </address>
            </div>
          )}

          {/* The invoice needs this and nothing else on this page carries it. */}
          {order.billTo.gstin && (
            <p className="label-tech mt-3 break-all text-ink">
              GSTIN {order.billTo.gstin}
            </p>
          )}

          {/* The most important control on the card while payment is settled
              by telephone: a tap-to-call link, not a number to copy out. */}
          <a
            href={`tel:${(order.shipTo.phone || "").replace(/[^\d+]/g, "")}`}
            className="mt-3 inline-flex items-center gap-2 border border-line-strong px-3 py-2 font-mono text-sm text-ink hover:border-ink hover:bg-surface-subtle"
          >
            {order.shipTo.phone}
          </a>

          <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
            <Row label="Subtotal" value={formatPaise(order.subtotal)} />
            <Row label="CGST 9%" value={formatPaise(order.cgst)} />
            <Row label="SGST 9%" value={formatPaise(order.sgst)} />
            <Row
              label="Delivery"
              value={order.shipping > 0 ? formatPaise(order.shipping) : "Not quoted"}
            />
          </dl>
        </div>
      </div>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: Order["status"] }) {
  if (status === "pending") return <Badge tone="brand">New</Badge>;
  if (status === "cancelled") return <Badge>Cancelled</Badge>;
  return <Badge>{status[0].toUpperCase() + status.slice(1)}</Badge>;
}

/* Fixed locale and time zone, not the server's — rendered on the server and
   never rehydrated, so leaving either to the environment makes the date depend
   on where the container happens to be running. Same as the enquiry inbox. */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
