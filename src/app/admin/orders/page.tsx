import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { sameOrderAddress } from "@/components/account/OrderAddress";
import { requireAdmin } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listCustomerEmails } from "@/lib/db/customers";
import {
  ADMIN_ORDER_FILTERS,
  countOrdersByFilter,
  listOrdersPage,
  orderSummary,
  type AdminOrderFilter,
  type OrderFilterCounts,
} from "@/lib/db/orders";
import { InfoNote } from "@/components/admin/InfoNote";
import { ListPager, ListSearch } from "@/components/admin/ListControls";
import { listHref, listSearch, readListQuery } from "@/lib/admin-list";
import { formatPaise } from "@/lib/pricing";
import type { Order } from "@/lib/types";
import { isShiprocketConfigured, trackingUrl } from "@/lib/shiprocket";
import { trackingLabel } from "@/lib/tracking";
import { bookShipmentAction, checkRefundsAction, refreshTrackingAction } from "@/app/admin/actions";
import { OrderStatusSelect } from "./OrderStatusSelect";
import { PendingOrderActions } from "./OrderActions";
import { RefundForm } from "./RefundForm";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { refundBlock, refundBlockMessage } from "@/lib/refunds";
import { isCod } from "@/lib/order-payment";
import { formatNoonDeadline, shipmentBookable } from "@/lib/order-delivery";

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
    confirmed?: string;
    error?: string;
    shipped?: string;
    shipError?: string;
    mailed?: string;
    shipment?: string;
    tracked?: string;
    refunded?: string;
    refundError?: string;
    refundUnrecorded?: string;
    refundPending?: string;
    refundChecked?: string;
    q?: string;
    page?: string;
    status?: string;
  }>;
}) {
  const admin = await requireAdmin();

  const params = await searchParams;
  const {
    updated,
    confirmed,
    error,
    shipped,
    shipError,
    mailed,
    shipment,
    tracked,
    refunded,
    refundError,
    refundUnrecorded,
    refundPending,
    refundChecked,
  } = params;
  const canRefund = isRazorpayConfigured();
  const canShip = isShiprocketConfigured();

  /* Search by order number, email or phone, filter by status or the refund
     queue, ten a page (client, 2026-09-19 and 2026-09-21). An unknown
     `?status=` is ignored, not an error. */
  const query = readListQuery(params);
  const filter = (ADMIN_ORDER_FILTERS as readonly string[]).includes(params.status ?? "")
    ? (params.status as AdminOrderFilter)
    : "";
  const [{ orders, total, page }, counts, summary] = await Promise.all([
    listOrdersPage({ q: query.q, filter, page: query.page }),
    countOrdersByFilter(query.q),
    orderSummary(),
  ]);
  const emails = await listCustomerEmails([...new Set(orders.map((o) => o.customerId))]);
  /* Posted with every form on a card, so each action comes back here — the
     same search, filter and page — rather than to page 1. */
  const view = listSearch({ q: query.q, status: filter, page });

  /* "Needs action" is pending-or-confirmed, i.e. not yet out of the door and
     not cancelled — across every order, not just this page. */
  const { open, revenue } = summary;

  return (
    <Container size="wide">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl">Orders</h1>
          <p className="mt-1 text-sm text-muted">
            {summary.total} total ·{" "}
            {open === 0 ? "none waiting" : `${open} still to fulfil`} ·{" "}
            {formatPaise(revenue)} booked
          </p>
        </div>

        <ListSearch
          path="/admin/orders"
          q={query.q}
          placeholder="Order number, email or phone"
          label="Search orders"
          keep={{ status: filter }}
        />
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

      {error === "access" && (
        <p
          role="alert"
          className="mt-6 flex items-center gap-3 border border-signal-500 bg-surface px-4 py-3 text-sm text-ink"
        >
          <svg aria-hidden className="h-4 w-4 shrink-0 text-signal-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
          <span>
            <span className="font-medium">You don&apos;t have permission to do that.</span>
            {" "}Your role does not allow this action.
          </span>
        </p>
      )}

      {confirmed && (
        <p role="status" className="mt-6 border-l-2 border-accent bg-surface px-4 py-3 text-sm text-ink">
          Order confirmed.
        </p>
      )}

      {(updated || (error && error !== "access")) && (
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
              : refundPending
                ? `Refund of ${formatPaise(Number(refunded))} started. Razorpay is processing it — the order shows "Refund processing" until Razorpay confirms, then "Refunded". Razorpay tells the customer; it reaches them in 5–7 days.`
                : `Refund of ${formatPaise(Number(refunded))} done through Razorpay, which tells the customer; it reaches them in 5–7 days.`}
        </p>
      )}
      {refundChecked && (
        <p role="status" className="mt-6 border-l-2 border-accent bg-surface px-4 py-3 text-sm text-ink">
          {refundChecked === "settled"
            ? "Refund status updated from Razorpay."
            : "Razorpay is still processing that refund. Check again later — the page also updates by itself when Razorpay confirms it."}
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
              : shipError === "window"
                ? "Not yet — the customer can still change that order's delivery address. Booking opens at 12 pm the day after the order was confirmed."
                : shipError
                ? "Shiprocket refused the booking. The reason is in the server log — usually the pickup location nickname or a missing PIN code."
                : "Shipment booked."}
        </p>
      )}

      {/* Rewritten 2026-09-17 when Razorpay went live: it used to say payment
          was not taken online and had to be settled by phone. The refund line
          is the one that costs money if missed — cancelling here emails the
          customer a refund promise, and nothing on this page issues it.
          Folded behind the info button 2026-09-21. */}
      <InfoNote title="How this page works">
        <p>
          <span className="font-medium text-ink">New orders are emailed to orders@vkon.in</span>{" "}
          — a cash-on-delivery order when it is placed, an online order once
          it is paid. That is the only order email we get; follow everything
          after it here.
        </p>
        <p>
          <span className="font-medium text-ink">An order arrives as New</span>{" "}
          and stays there until you set it to Confirmed — paying online no
          longer confirms an order by itself, so every order waits for you.
        </p>
        <p>
          <span className="font-medium text-ink">Only paid orders are listed:</span>{" "}
          cash on delivery (<span className="font-medium text-ink">COD</span>) and
          orders paid online (<span className="font-medium text-ink">Paid online</span>).
          An online order that was never paid, or whose payment failed, is not
          shown — the customer sees it in their order history and can pay from
          there, and it appears here once they do. A delivery charge that could
          not be quoted at checkout shows as{" "}
          <span className="font-medium text-ink">Not quoted</span> — ring the
          customer to agree it before dispatch.
        </p>
        <p>
          <span className="font-medium text-ink">Cancelling does not refund.</span>{" "}
          Customers may cancel until dispatch. For an order paid online, cancel
          it first, then use <span className="font-medium text-ink">Refund</span>{" "}
          on the order — full or partial. It shows{" "}
          <span className="font-medium text-ink">Refund processing</span> until
          Razorpay confirms, then <span className="font-medium text-ink">Refunded</span>.
          A dispatched or returned order is refunded in the Razorpay dashboard.
          Razorpay tells the customer either way, and the money reaches them in
          5–7 days. A cash-on-delivery refund is paid back in person.
        </p>
        <p>
          <span className="font-medium text-ink">Cancelled orders split in two:</span>{" "}
          <span className="font-medium text-ink">Refund-cancelled</span> holds
          the ones paid online whose money is not back yet — owed, or being
          processed by Razorpay. Each one leaves for{" "}
          <span className="font-medium text-ink">Cancelled</span> as its refund
          completes, which is also where cash-on-delivery cancellations sit.
        </p>
        <p>
          <span className="font-medium text-ink">Pending-not quoted</span> is
          part of <span className="font-medium text-ink">Pending</span>, not a
          separate pile: the waiting orders checkout could not price delivery
          for — ring the customer to agree a charge before dispatch.
        </p>
        <p>
          The site emails the customer their order confirmation and, if you
          cancel, the cancellation. Shipping and delivery updates come from
          Shiprocket; payment receipts and refunds from Razorpay.
        </p>
      </InfoNote>

      <OrderFilters q={query.q} filter={filter} counts={counts} />

      <div className="mt-4 space-y-4">
        {orders.length === 0 ? (
          <div className="border border-line bg-surface px-6 py-16 text-center">
            {query.q || filter ? (
              <>
                <p className="text-ink">
                  {filter === "refund-cancelled"
                    ? "No cancelled order is waiting on a refund"
                    : filter === "pending-unquoted"
                      ? "Every pending order has a delivery price"
                      : `No ${filter ? `${FILTER_LABELS[filter].toLowerCase()} ` : ""}orders`}
                  {query.q ? ` match “${query.q}”` : ""}.
                </p>
                <Link href="/admin/orders" className="mt-2 inline-block text-sm text-accent hover:underline">
                  Show all orders
                </Link>
              </>
            ) : (
              <>
                <p className="text-ink">No orders yet.</p>
                <p className="mt-1 text-sm text-muted">
                  Orders placed at checkout appear here.
                </p>
              </>
            )}
          </div>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              canShip={canShip}
              canRefund={canRefund}
              customerEmail={emails.get(order.customerId) ?? null}
              view={view}
              role={admin.role}
            />
          ))
        )}
        {total > 0 && (
          <div className="border border-line bg-surface">
            <ListPager path="/admin/orders" page={page} total={total} keep={{ q: query.q, status: filter }} />
          </div>
        )}
      </div>
    </Container>
  );
}

const FILTER_LABELS: Record<AdminOrderFilter, string> = {
  pending: "Pending",
  "pending-unquoted": "Pending-not quoted",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  "refund-cancelled": "Refund-cancelled",
};

/**
 * Every way of reading the list, each with how many orders match the current
 * search (client, 2026-09-19 and 2026-09-21). Links, not a select: one tap,
 * no JavaScript, and the choice stays in the URL. Choosing one keeps the
 * search and goes back to page 1.
 *
 * Two of them are not statuses:
 *
 *  - **Pending-not quoted** is a slice of Pending, not a stage beside it:
 *    the waiting orders with no delivery price on them;
 *  - **Refund-cancelled** is the money side of a cancellation: cancelled,
 *    paid online, not refunded yet. It empties as refunds land, and those
 *    orders then read as plain Cancelled.
 *
 * What each one selects lives in `ADMIN_ORDER_FILTER_SQL`, beside the counts.
 */
function OrderFilters({
  q,
  filter,
  counts,
}: {
  q: string;
  filter: AdminOrderFilter | "";
  counts: OrderFilterCounts;
}) {
  const options: { value: AdminOrderFilter | ""; label: string; n: number }[] = [
    { value: "", label: "All", n: counts.all },
    ...ADMIN_ORDER_FILTERS.map((f) => ({ value: f, label: FILTER_LABELS[f], n: counts[f] })),
  ];
  let sortExplanation = "Sorted from newest to oldest by order date.";
  if (
    filter === "pending" ||
    filter === "pending-unquoted" ||
    filter === "confirmed" ||
    filter === "refund-cancelled"
  ) {
    sortExplanation = "Sorted from oldest to newest by order date.";
  } else if (filter === "shipped") {
    sortExplanation = "Sorted from newest to oldest by shipped date.";
  } else if (filter === "delivered") {
    sortExplanation = "Sorted from newest to oldest by delivered date.";
  } else if (filter === "") {
    sortExplanation = "Showing all orders sorted from newest to oldest by order date.";
  }

  return (
    <>
      <nav aria-label="Filter orders" className="mt-8 flex flex-wrap gap-2">
        {options.map((option) => {
          const current = option.value === filter;
          return (
            <Link
              key={option.label}
              href={listHref("/admin/orders", { q, status: option.value })}
              aria-current={current ? "page" : undefined}
              className={`inline-flex h-9 items-center gap-2 border px-3 text-sm font-medium transition-colors ${
                current
                  ? "border-ink bg-ink text-surface"
                  : "border-line-strong text-ink hover:border-ink hover:bg-surface-subtle"
              }`}
            >
              {option.label}
              <span className={`tabular-nums ${current ? "text-surface/80" : "text-muted"}`}>{option.n}</span>
            </Link>
          );
        })}
      </nav>
      <p className="mt-3 text-sm text-muted">{sortExplanation}</p>
    </>
  );
}

function OrderCard({
  order,
  canShip,
  canRefund,
  customerEmail,
  view,
  role,
}: {
  order: Order;
  canShip: boolean;
  canRefund: boolean;
  customerEmail: string | null;
  /** The list view the card is on, posted with each of its forms. */
  view: string;
  role: string;
}) {
  const settled = order.status === "delivered" || order.status === "cancelled";
  const bookable = shipmentBookable(order);
  /* The confirmation email carries the address as it was placed; this says
     the one on the card is newer (2026-09-18). */
  const changedNote = order.addressChangedAt
    ? `Address changed by the customer · ${formatDate(order.addressChangedAt)}`
    : null;

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
            {/* How it is paid, first (client, 2026-09-17). Only confirmed
                orders are listed, so there is no "Payment due" or "Payment
                failed" here any more: cash on delivery reads COD, and an
                online order is paid or refunded. The last branch is for old
                phone-settled orders from before online payment. */}
            {isCod(order) ? (
              <Badge>COD</Badge>
            ) : order.paymentStatus === "paid" ? (
              <Badge tone="brand">Paid online</Badge>
            ) : order.paymentStatus === "refunded" ? (
              <Badge>Online · Refunded</Badge>
            ) : (
              <Badge>Settled by phone</Badge>
            )}
            {/* A refund in flight reads as processing until Razorpay confirms
                it (client, 2026-09-19); a finished partial refund shows how
                much. A finished full one is the "Online · Refunded" badge. */}
            {order.refundPending ? (
              <Badge tone="warn">Refund processing</Badge>
            ) : order.paymentStatus === "paid" && order.refundedAmount > 0 ? (
              <Badge tone="warn">Refunded {formatPaise(order.refundedAmount)}</Badge>
            ) : null}
          </div>
          <div className="label-tech mt-1.5 text-muted space-y-0.5">
            <p>Ordered: {formatDate(order.createdAt)}</p>
            {order.status === "shipped" && order.shippedAt && (
              <p>Shipped: {formatDate(order.shippedAt)}</p>
            )}
            {order.status === "delivered" && (
              <>
                {order.shippedAt && <p>Shipped: {formatDate(order.shippedAt)}</p>}
                {order.deliveredAt && <p>Delivered: {formatDate(order.deliveredAt)}</p>}
              </>
            )}
            {order.status === "cancelled" && order.cancelledAt && (
              <p>Cancelled: {formatDate(order.cancelledAt)}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className="text-xl font-bold tabular-nums text-accent">
            {formatPaise(order.total)}
          </p>
          {order.status !== "pending" && (
            <OrderStatusSelect
              id={order.id}
              status={order.status}
              orderNumber={order.orderNumber}
              view={view}
            />
          )}
        </div>
      </div>

      {/* Two columns (client, 2026-09-21): everything about the order on the
          left, the people and places on the right. The left column is a flex
          column so its bottom row — payment, the bill, the shipment — sits on
          the card's floor when the addresses are the taller side, and is
          pushed down by a long list of items rather than the items scrolling
          past it. */}
      <div className="mt-5 grid gap-6 border-t border-line pt-5 lg:grid-cols-[1fr_18rem]">
        {/* `min-w-0`: a grid column will not shrink below its content without
            it, and a six-figure line total then pushes the card sideways on a
            phone. */}
        <div className="flex min-w-0 flex-col">
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

          {/* `mt-auto` is what puts this on the floor of the card. Payment
              takes the rest of the width, so its rule runs from the card's
              left edge to the bill's — the client's sketch. */}
          <div className="mt-auto grid gap-6 pt-5 sm:grid-cols-[1fr_20rem]">
            {/* Starts on the bill's line: with the shipment moved over to the
                addresses, the bill is all that shares this row. */}
            <div className="order-2 sm:order-1">
              <PaymentBlock order={order} canRefund={canRefund} view={view} role={role} />
            </div>

            <div className="order-1 sm:order-2">
              <dl className="space-y-1.5 border-t border-line pt-4 text-sm">
                <Row label="Subtotal" value={formatPaise(order.subtotal)} />
                <Row label="CGST 9%" value={formatPaise(order.cgst)} />
                <Row label="SGST 9%" value={formatPaise(order.sgst)} />
                <Row
                  label={
                    [
                      "Delivery",
                      order.deliveryService,
                      /* The courier the customer chose, before there is an AWB
                         to name one — booking assigns this service. */
                      order.awb ? null : order.courierName,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  }
                  value={order.shipping > 0 ? formatPaise(order.shipping) : "Not quoted"}
                />
                {/* What the bill adds up to (client, 2026-09-21). Same shape
                    as the customer's own copy: bold label, the figure in the
                    accent, ruled off from the parts above it. The figure by
                    the order number is the same number — this is the one at
                    the end of the arithmetic. */}
                <div className="flex items-center justify-between gap-4 border-t border-line pt-2.5">
                  <dt className="font-bold text-ink">Total</dt>
                  <dd className="text-base font-bold tabular-nums text-accent">
                    {formatPaise(order.total)}
                  </dd>
                </div>
                {/* Only once there is one: what has gone back, and whether
                    Razorpay has finished sending it. */}
                {order.refundedAmount > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted">
                      {order.refundPending ? "Refund processing" : "Refunded"}
                    </dt>
                    <dd className="font-semibold tabular-nums text-ink">
                      &minus;{formatPaise(order.refundedAmount)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>

        <div className="flex flex-col">
          {/* Both addresses in full when they differ, each with its own phone
              (client, 2026-09-18): the courier rings the delivery number, the
              invoice carries the billing one, and they are often different
              people — a site engineer receiving, an office paying. One block
              when they are the same place, which is most orders. */}
          {sameOrderAddress(order.billTo, order.shipTo) ? (
            <AdminAddress label="Bill & deliver to" address={order.shipTo} note={changedNote} />
          ) : (
            <>
              <AdminAddress label="Deliver to" address={order.shipTo} note={changedNote} />
              <div className="mt-5 border-t border-line pt-4">
                <AdminAddress label="Bill to" address={order.billTo} />
              </div>
            </>
          )}

          {/* mt-auto pushes this group to the card floor, aligning it with the
              PAYMENT / pricing row on the left column (2026-09-23). */}
          <div className="mt-auto border-t border-line pt-5">
            {/* The account's email — the addresses carry none. Order mail goes
                here, so it is the one to write to. */}
            {customerEmail && (
              <p className="text-sm">
                <span className="label-tech block text-muted">Account email</span>
                <a href={`mailto:${customerEmail}`} className="mt-1 inline-block break-all text-accent hover:underline">
                  {customerEmail}
                </a>
              </p>
            )}

            {/* Under the account email (client, 2026-09-21): the parcel belongs
                with where it is going and who to tell about it. */}
            <ShipmentBlock order={order} canShip={canShip} bookable={bookable} view={view} />
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * The parcel, or the button that creates one (moved out of the card's markup
 * 2026-09-21, when the bill and the shipment became the card's own column).
 */
function ShipmentBlock({
  order,
  canShip,
  bookable,
  view,
}: {
  order: Order;
  canShip: boolean;
  bookable: ReturnType<typeof shipmentBookable>;
  view: string;
}) {
  /* The shipment, once there is one — and the button to make one when there
     is not. Cancelled orders get neither: booking a parcel for an order that
     is not happening is the one mistake this button can make that costs real
     money. */
  return (
    <div className="mt-5 pt-4">
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
                <input type="hidden" name="view" value={view} />
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
      ) : order.status === "shipped" || order.status === "delivered" ? (
        /* Status was advanced without a Shiprocket booking — no AWB to show
           and no button to offer. The operator can assign an AWB manually in
           Shiprocket's dashboard if needed. */
        <p className="mt-2.5 text-sm text-muted">No Shiprocket booking on record.</p>
      ) : order.status === "pending" ? (
        /* Pending: show the Confirm / Cancel buttons here, at the bottom of
           the card, in place of the shipment section (2026-09-23). */
        <div className="mt-2.5">
          <PendingOrderActions
            id={order.id}
            orderNumber={order.orderNumber}
            view={view}
            isCod={isCod(order)}
          />
        </div>
      ) : canShip && !bookable.bookable ? (
        /* The customer may still move the parcel until 12 pm the day
           after the order was confirmed (client, 2026-09-18). A label
           printed before then can carry an address that is no longer
           the order's — so the button waits, and says until when. The
           action refuses too; this is the explanation, not the guard. */
        <div className="mt-2.5">
          <button
            type="button"
            disabled
            className="inline-flex h-9 cursor-not-allowed items-center border border-line px-3 text-sm font-medium text-muted"
          >
            Book shipment
          </button>
          <p className="mt-2 text-sm text-body">
            Opens at {formatNoonDeadline(bookable.from)} — until then the customer can
            change the delivery address.
          </p>
        </div>
      ) : canShip ? (
        <form action={bookShipmentAction} className="mt-2.5">
          <input type="hidden" name="id" value={order.id} />
          <input type="hidden" name="view" value={view} />
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
  );
}

/**
 * How the order was paid, what has gone back, and the Refund button (client,
 * 2026-09-17). Sits under Shipment for the same reason: it is the other thing
 * done *to* an order from this card rather than read off it.
 *
 * The button appears only when `refundBlock` allows it: a captured online
 * payment with something left, and no shipment booked or dispatched — except
 * a cancelled order that never left, see `lib/refunds.ts`. When a shipment
 * blocks it, the card says why instead of silently having no button. A
 * cancelled order that is still owed a refund is called out in amber — the
 * cancellation email has already promised the customer one.
 */
function PaymentBlock({ order, canRefund, view, role }: { order: Order; canRefund: boolean; view: string; role: string }) {
  const online = order.paymentProvider === "razorpay" && Boolean(order.paymentId);
  const remaining = order.total - order.refundedAmount;
  const paidOnline = online && (order.paymentStatus === "paid" || order.refundedAmount > 0);
  const block = refundBlock(order);
  /* Only after cancelling (client, 2026-09-19), and not while one is already
     on its way. */
  const canRefundNow = block === null && !order.refundPending;
  const owed = order.status === "cancelled" && paidOnline && remaining > 0 && canRefundNow;

  return (
    /* No top margin: this is a cell of the card's bottom row, and its rule
       has to line up with the bill's beside it. */
    <div className="border-t border-line pt-4">
      <p className="label-tech text-muted">Payment</p>

      {paidOnline ? (
        <div className="mt-2.5 space-y-2 text-sm">
          <p className="text-ink">
            Paid online ·{" "}
            <span className="break-all font-mono text-[0.8125rem]">{order.paymentId}</span>
          </p>

          {/* Refund processing → Refunded (client, 2026-09-19): processing from
              the Refund button until Razorpay confirms — by the
              `refund.processed` webhook, or "Check with Razorpay". */}
          {order.refundPending ? (
            <div className="space-y-2">
              <p className="flex flex-wrap items-center gap-2 text-body">
                <Badge tone="warn">Refund processing</Badge>
                {formatPaise(order.refundedAmount)} sent to Razorpay
                {order.refundedAt && <span className="text-muted">· {formatDate(order.refundedAt)}</span>}
              </p>
              <form action={checkRefundsAction}>
                <input type="hidden" name="id" value={order.id} />
                <input type="hidden" name="view" value={view} />
                <button
                  type="submit"
                  disabled={role !== "super" && role !== "admin"}
                  title={role !== "super" && role !== "admin" ? "You don't have permission to do this" : ""}
                  className="inline-flex h-8 items-center border border-line-strong px-2.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle disabled:opacity-50"
                >
                  Check with Razorpay
                </button>
              </form>
            </div>
          ) : order.refundedAmount > 0 ? (
            <p className="flex flex-wrap items-center gap-2 text-body">
              <Badge tone="brand">Refunded</Badge>
              {formatPaise(order.refundedAmount)}
              {remaining > 0 ? ` of ${formatPaise(order.total)}` : " — the full amount"}
              {order.refundedAt && <span className="text-muted">· {formatDate(order.refundedAt)}</span>}
            </p>
          ) : null}

          {owed && (
            <p className="font-medium text-signal-700">
              Cancelled but not refunded — the customer was told a refund is on its way.
            </p>
          )}

          {canRefundNow ? (
            canRefund ? (
              <RefundForm
                id={order.id}
                orderNumber={order.orderNumber}
                remainingRupees={(remaining / 100).toFixed(2)}
                view={view}
                disabled={role !== "super" && role !== "admin"}
              />
            ) : (
              <p className="text-muted">Razorpay not configured — refunds are unavailable.</p>
            )
          ) : block === "not_cancelled" ? (
            <p className="text-xs text-muted">Refund becomes available once the order is cancelled.</p>
          ) : block === "dispatched" ? (
            <p className="text-muted">{refundBlockMessage(block)}</p>
          ) : null}
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

/**
 * One address on an order card: who, where, the number to ring and, when
 * there is one, the GSTIN. The phone is a tap-to-call link, not a number to
 * copy out — ringing the customer is what this card is used for most.
 */
function AdminAddress({
  label,
  address,
  note,
}: {
  label: string;
  address: Order["shipTo"];
  note?: string | null;
}) {
  const tel = (address.phone || "").replace(/[^\d+]/g, "");
  return (
    <div>
      <p className="label-tech text-muted">{label}</p>
      <p className="mt-2.5 font-medium text-ink">{address.name}</p>
      <address className="mt-1 text-sm not-italic leading-relaxed text-body">
        {address.line1}
        {address.line2 && (
          <>
            <br />
            {address.line2}
          </>
        )}
        <br />
        {address.city}, {address.state} {address.postalCode}
      </address>
      {note && <p className="mt-1.5 text-xs text-muted">{note}</p>}
      {address.phone && (
        <a
          href={`tel:${tel}`}
          className="mt-2.5 inline-flex items-center gap-2 border border-line-strong px-3 py-2 font-mono text-sm text-ink hover:border-ink hover:bg-surface-subtle"
        >
          {address.phone}
        </a>
      )}
      {address.gstin && (
        <p className="label-tech mt-2.5 break-all text-ink">GSTIN {address.gstin}</p>
      )}
    </div>
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
