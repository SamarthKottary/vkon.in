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
import { isShiprocketConfigured, trackingUrl } from "@/lib/shiprocket";
import { trackingLabel } from "@/lib/tracking";
import { bookShipmentAction, refreshTrackingAction } from "@/app/admin/actions";
import { OrderStatusSelect } from "./OrderStatusSelect";
import { RefundForm } from "./RefundForm";
import { isRazorpayConfigured } from "@/lib/razorpay";

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
  searchParams: Promise<{
    updated?: string;
    error?: string;
    shipped?: string;
    shipError?: string;
    mailed?: string;
    shipment?: string;
    tracked?: string;
    refunded?: string;
    refundError?: string;
    refundUnrecorded?: string;
  }>;
}) {
  if (!(await isAuthenticated())) redirect("/admin");

  const {
    updated,
    error,
    shipped,
    shipError,
    mailed,
    shipment,
    tracked,
    refunded,
    refundError,
    refundUnrecorded,
  } = await searchParams;
  const canRefund = isRazorpayConfigured();
  const orders = await listAllOrders();
  const canShip = isShiprocketConfigured();

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
          {error
            ? "Could not update that order."
            : `Order updated.${mailed ? " The customer has been emailed." : ""}`}
          {/* A cancellation reaches Shiprocket too, when a shipment was booked.
              Each outcome needs something different done, so each is said. */}
          {shipment === "cancelled" && " The Shiprocket shipment was cancelled."}
          {shipment === "failed" &&
            " Shiprocket did not cancel the shipment — cancel it in their dashboard so the courier does not collect it."}
          {shipment === "picked" &&
            " The parcel is already with the courier, so Shiprocket cannot cancel it — arrange a return in their dashboard."}
        </p>
      )}

      {/* Razorpay's own words on a refusal (not enough balance, more than is
          left to refund), rendered as text — React escapes it. */}
      {(refunded || refundError) && (
        <p
          role="status"
          className={`mt-6 border-l-2 bg-surface px-4 py-3 text-sm text-ink ${
            refundError ? "border-signal-500" : "border-accent"
          }`}
        >
          {refundError
            ? `Nothing was refunded. ${refundError}`
            : refundUnrecorded
              ? `Refund of ${formatPaise(Number(refunded))} sent through Razorpay, but it could not be recorded here yet. It will appear when Razorpay confirms it — do not refund again.`
              : `Refund of ${formatPaise(Number(refunded))} sent through Razorpay. The customer has been emailed; it reaches them in 5–7 days.`}
        </p>
      )}

      {tracked && (
        <p
          role="status"
          className={`mt-6 border-l-2 bg-surface px-4 py-3 text-sm text-ink ${
            tracked === "failed" || tracked === "none" ? "border-signal-500" : "border-accent"
          }`}
        >
          {tracked === "failed"
            ? "Could not reach Shiprocket for tracking. The reason is in the server log."
            : tracked === "none"
              ? "Shiprocket has no tracking for that parcel yet. A new AWB usually shows its first scan within a few hours of pickup."
              : tracked === "mailed"
                ? "Tracking updated, and the customer has been emailed about the change."
                : "Tracking updated."}
        </p>
      )}

      {/* Booking talks to somebody else's API, so its outcomes are spelled out
          rather than folded into the generic "could not update": each of these
          needs a different thing done about it, and "it failed" would send the
          operator to the logs to find out which. */}
      {(shipped || shipError) && (
        <p
          role="status"
          className={`mt-6 border-l-2 bg-surface px-4 py-3 text-sm text-ink ${
            shipError ? "border-signal-500" : "border-accent"
          }`}
        >
          {shipError === "unconfigured"
            ? "Shiprocket is not configured — set the SHIPROCKET_* variables in .env and restart. See docs/SHIPPING.md."
            : shipError === "already"
              ? "That order already has a shipment. Manage it in the Shiprocket dashboard."
              : shipError
                ? "Shiprocket refused the booking. The reason is in the server log — usually the pickup location nickname or a missing PIN code."
                : "Shipment booked."}
        </p>
      )}

      {/* Rewritten 2026-09-17 when Razorpay went live: it used to say payment
          was not taken online and had to be settled by phone. The refund line
          is the one that costs money if missed — cancelling here emails the
          customer a refund promise, and nothing on this page issues it. */}
      <div className="mt-6 space-y-2 border-l-2 border-line-strong px-4 py-3 text-sm text-body">
        <p>
          <span className="font-medium text-ink">New orders are emailed to support@vkon.in</span>{" "}
          — a cash-on-delivery order when it is placed, an online order once
          it is paid. An unpaid or failed online order appears only here.
        </p>
        <p>
          <span className="font-medium text-ink">Payments are taken online.</span>{" "}
          An order paid through Razorpay shows <span className="font-medium text-ink">Paid</span>.
          A cash-on-delivery order, or one whose online payment did not go
          through, shows <span className="font-medium text-ink">Payment due</span>. A
          delivery charge that could not be quoted at checkout shows as{" "}
          <span className="font-medium text-ink">Not quoted</span> — ring the
          customer to agree it before dispatch.
        </p>
        <p>
          <span className="font-medium text-ink">Cancelling does not refund.</span>{" "}
          Customers may cancel until dispatch. For an order paid online, use{" "}
          <span className="font-medium text-ink">Refund</span> on the order —
          full or partial. The customer is emailed, and the money reaches them
          in 5–7 days. A cash-on-delivery refund is paid back in person.
        </p>
        <p>
          The customer is emailed when you mark an order shipped, delivered or
          cancelled, and when the courier reports it shipped, out for delivery
          or delivered.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        {orders.length === 0 ? (
          <div className="border border-line bg-surface px-6 py-16 text-center">
            <p className="text-ink">No orders yet.</p>
            <p className="mt-1 text-sm text-muted">
              Orders placed at checkout appear here.
            </p>
          </div>
        ) : (
          orders.map((order) => (
            <OrderCard key={order.id} order={order} canShip={canShip} canRefund={canRefund} />
          ))
        )}
      </div>
    </Container>
  );
}

function OrderCard({
  order,
  canShip,
  canRefund,
}: {
  order: Order;
  canShip: boolean;
  canRefund: boolean;
}) {
  const settled = order.status === "delivered" || order.status === "cancelled";

  return (
    <article
      id={`order-${order.id}`}
      className={`scroll-mt-24 border bg-surface p-5 ${
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
            {/* Refunded and failed are their own badges since 2026-09-17: a
                refunded order read "Payment due", which invites chasing a
                customer for money already sent back. */}
            {order.paymentStatus === "paid" ? (
              <Badge tone="brand">Paid</Badge>
            ) : order.paymentStatus === "refunded" ? (
              <Badge>Refunded</Badge>
            ) : order.paymentStatus === "failed" ? (
              <Badge tone="warn">Payment failed</Badge>
            ) : (
              <Badge>Payment due</Badge>
            )}
            {order.paymentStatus === "paid" && order.refundedAmount > 0 && (
              <Badge tone="warn">Refunded {formatPaise(order.refundedAmount)}</Badge>
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

          {/* The shipment, once there is one — and the button to make one when
              there is not. Cancelled orders get neither: booking a parcel for
              an order that is not happening is the one mistake this button can
              make that costs real money. */}
          <div className="mt-5 border-t border-line pt-4">
            <p className="label-tech text-muted">Shipment</p>

            {order.awb ? (
              <div className="mt-2.5 space-y-1.5 text-sm">
                <p className="text-ink">
                  {order.courierName || "Courier"} ·{" "}
                  <span className="font-mono">{order.awb}</span>
                </p>

                {/* The courier's status in the words the customer sees, with
                    Shiprocket's own beneath it — the one to quote when talking
                    to their support. Returns and failed attempts are the ones
                    that need the operator, so they stand out. */}
                {order.trackingStatus ? (
                  <div className="pt-1">
                    <p
                      className={`font-semibold ${
                        needsAttention(order.trackingStatus) ? "text-signal-700" : "text-ink"
                      }`}
                    >
                      {trackingLabel(order.trackingStatus)}
                    </p>
                    <p className="label-tech text-muted">
                      {order.trackingStatus}
                      {order.trackingUpdatedAt &&
                        ` · checked ${formatDate(order.trackingUpdatedAt)}`}
                    </p>
                    {order.trackingEta && order.status !== "delivered" && (
                      <p className="mt-1 text-body">
                        Expected by {formatDay(order.trackingEta)}
                      </p>
                    )}
                    {order.trackingEvents[0] && (
                      <p className="mt-1 text-body">
                        {order.trackingEvents[0].activity}
                        {order.trackingEvents[0].location &&
                          ` — ${order.trackingEvents[0].location}`}
                        {order.trackingEvents[0].at && (
                          <span className="text-muted">
                            {" "}
                            · {formatDate(order.trackingEvents[0].at)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted">No tracking update yet.</p>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                  <a
                    href={trackingUrl(order.awb)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Track this parcel
                  </a>
                  {canShip && (
                    <form action={refreshTrackingAction}>
                      <input type="hidden" name="id" value={order.id} />
                      <button
                        type="submit"
                        className="inline-flex h-8 items-center border border-line-strong px-2.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
                      >
                        Refresh tracking
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ) : order.shipmentId ? (
              /* Created at Shiprocket but no AWB came back — recoverable from
                 their dashboard, and re-pressing the button here would only
                 try to create a duplicate order. Says so rather than offering
                 a button that cannot help. */
              <p className="mt-2.5 text-sm text-body">
                Created at Shiprocket (shipment{" "}
                <span className="font-mono">{order.shipmentId}</span>) but no AWB was
                assigned. Assign a courier in their dashboard.
              </p>
            ) : order.status === "cancelled" ? (
              <p className="mt-2.5 text-sm text-muted">Order cancelled — not shipping.</p>
            ) : canShip ? (
              <form action={bookShipmentAction} className="mt-2.5">
                <input type="hidden" name="id" value={order.id} />
                <button
                  type="submit"
                  className="inline-flex h-9 items-center border border-line-strong px-3 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
                >
                  Book shipment
                </button>
              </form>
            ) : (
              <p className="mt-2.5 text-sm text-muted">
                Shiprocket not configured — see docs/SHIPPING.md.
              </p>
            )}
          </div>

          <PaymentBlock order={order} canRefund={canRefund} />
        </div>
      </div>
    </article>
  );
}

/**
 * How the order was paid, what has gone back, and the Refund button (client,
 * 2026-09-17). Sits under Shipment for the same reason: it is the other thing
 * done *to* an order from this card rather than read off it.
 *
 * The button appears only for a captured online payment with something left
 * to refund. A cancelled order that was paid and not yet refunded is called
 * out in amber — the cancellation email has already promised the customer a
 * refund in 5–7 days, and nothing else on this page would say it is owed.
 */
function PaymentBlock({ order, canRefund }: { order: Order; canRefund: boolean }) {
  const online = order.paymentProvider === "razorpay" && Boolean(order.paymentId);
  const remaining = order.total - order.refundedAmount;
  const paidOnline = online && (order.paymentStatus === "paid" || order.refundedAmount > 0);
  const owed = order.status === "cancelled" && paidOnline && remaining > 0;

  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="label-tech text-muted">Payment</p>

      {paidOnline ? (
        <div className="mt-2.5 space-y-1.5 text-sm">
          <p className="text-ink">
            Paid online ·{" "}
            <span className="break-all font-mono text-[0.8125rem]">{order.paymentId}</span>
          </p>
          {order.refundedAmount > 0 && (
            <p className="text-body">
              Refunded {formatPaise(order.refundedAmount)}
              {remaining > 0 ? ` of ${formatPaise(order.total)}` : " — the full amount"}
              {order.refundedAt && (
                <span className="text-muted"> · {formatDate(order.refundedAt)}</span>
              )}
            </p>
          )}
          {owed && (
            <p className="font-medium text-signal-700">
              Cancelled but not refunded — the customer was told a refund is on its way.
            </p>
          )}
          {remaining > 0 &&
            (canRefund ? (
              <RefundForm
                id={order.id}
                orderNumber={order.orderNumber}
                remainingRupees={(remaining / 100).toFixed(2)}
              />
            ) : (
              <p className="text-muted">Razorpay not configured — refunds are unavailable.</p>
            ))}
        </div>
      ) : order.paymentProvider === "cod" ? (
        <p className="mt-2.5 text-sm text-body">
          Cash on delivery. Any refund is paid back in person, not through the site.
        </p>
      ) : (
        <p className="mt-2.5 text-sm text-muted">Not paid yet.</p>
      )}
    </div>
  );
}

/** Courier states that mean the operator probably has a call to make. */
function needsAttention(raw: string): boolean {
  const s = raw.toLowerCase();
  return (
    /\brto\b/.test(s.replace(/[_-]+/g, " ")) ||
    s.includes("return") ||
    s.includes("undelivered") ||
    s.includes("cancel") ||
    s.includes("exception") ||
    s.includes("lost") ||
    s.includes("damage")
  );
}

function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${day}T12:00:00+05:30`));
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
