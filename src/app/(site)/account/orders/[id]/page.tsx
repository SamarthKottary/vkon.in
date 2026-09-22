import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertIcon, CheckIcon } from "@/components/icons/ui";
import { OrderFooterActions } from "@/components/account/OrderFooterActions";
import { OrderStatusBadge } from "@/components/account/OrderStatusBadge";
import { ClearCartOnPlaced } from "@/components/cart/ClearCartOnPlaced";
import { PayNowButton } from "@/components/checkout/PayNowButton";
import { PaymentSuccessOnArrival } from "@/components/checkout/PaymentSuccessOnArrival";
import { CancelOrderButton } from "@/components/account/CancelOrderButton";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { AccountShell } from "@/components/account/AccountShell";
import { OrderAddress, sameOrderAddress } from "@/components/account/OrderAddress";
import { ItemReviewButton, ReviewFlowProvider } from "@/components/account/ReviewFlow";
import { OrderAddressEdit } from "@/components/account/OrderAddressEdit";
import { requireSignIn } from "@/lib/account";
import { listAddresses } from "@/lib/db/addresses";
import { getOrderForCustomer } from "@/lib/db/orders";
import { reviewsForOrder } from "@/lib/db/reviews";
import { formatPaise } from "@/lib/pricing";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { trackingUrl } from "@/lib/shiprocket";
import { trackingLabel } from "@/lib/tracking";
import { isCod } from "@/lib/order-payment";
import { addressEditWindow, formatNoonDeadline } from "@/lib/order-delivery";
import { site } from "@/content/site";
import type { Order } from "@/lib/types";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Order",
  description: "The details of one order.",
  path: "/account/orders",
  noIndex: true,
});

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* Courier scans and estimates are Indian times; pinned so a server elsewhere
   does not shift them. */
function formatMoment(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${day}T12:00:00+05:30`));
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string; unpaid?: string }>;
}) {
  const { id } = await params;
  const customer = await requireSignIn(`/account/orders/${id}`);

  /* Scoped to the owner inside the query, not checked afterwards — see the
     note on `getOrderForCustomer`. Somebody else's order id is a 404 here,
     which is also the right answer: "not found" and "not yours" should be
     indistinguishable, or the page becomes a way to test which ids exist. */
  const order = await getOrderForCustomer(customer.id, id);
  /* What this customer has already written about these products — a review is
     one per product, and the form opens on it (client, 2026-09-22). */
  const reviews = order ? await reviewsForOrder(customer.id, order.id) : new Map();
  /* A review belongs to a delivered order (client, 2026-09-22): it is of the
     thing in your hands, not of the wait for it. */
  const canReview = order?.status === "delivered";
  const flowItems = (order?.items ?? [])
    .filter((item) => item.productId)
    .map((item) => {
      const review = reviews.get(item.productId);
      return {
        productId: item.productId,
        slug: item.slug,
        name: item.name,
        review: review
          ? {
              rating: review.rating,
              comment: review.comment,
              media: review.media,
              status: review.status,
            }
          : null,
      };
    });
  if (!order) notFound();

  const { placed, unpaid } = await searchParams;
  const justPlaced = placed === order.orderNumber;
  /* Arrived from checkout after the payment window closed without a payment.
     The order is real either way, so the cart goes; the note only shows while
     it is still unpaid — a webhook may have settled it in the meantime. */
  const leftUnpaid = unpaid === order.orderNumber;

  /* Read on the server: `isRazorpayConfigured` looks at the secret, which must
     never reach the browser. Only the boolean crosses. */
  const payOnline = isRazorpayConfigured();
  const sameAddress = sameOrderAddress(order.billTo, order.shipTo);

  const isAwaitingPayment =
    !isCod(order) &&
    order.status === "pending" &&
    (order.paymentStatus === "unpaid" || order.paymentStatus === "failed");

  /* The delivery address can be changed while the order waits to be paid,
     and then until 12 pm the next day — after which the admin books the
     courier (client, 2026-09-18). The save re-checks all of this. */
  const addressEdit = addressEditWindow(order);
  /* The address book, for the Edit pop-ups — the same list checkout chooses
     from (client, 2026-09-18). */
  const addresses = await listAddresses(customer.id);
  /* Billing now shares the delivery address's window (client, 2026-09-18:
     "in same way the billing address edit button should go away at 12pm"). */
  const until = addressEdit.editable ? addressEdit.until : null;
  const editBilling = (label?: string) =>
    addressEdit.editable ? (
      <OrderAddressEdit
        role="billing"
        orderId={order.id}
        current={order.billTo}
        addresses={addresses}
        until={until}
        label={label}
      />
    ) : null;
  const editDelivery = (label?: string) =>
    addressEdit.editable ? (
      <OrderAddressEdit
        role="delivery"
        orderId={order.id}
        current={order.shipTo}
        addresses={addresses}
        delivery={deliveryNow}
        until={until}
        label={label}
      />
    ) : null;
  const deliveryNow = {
    orderId: order.id,
    shipTo: order.shipTo,
    cod: isCod(order),
    service: order.deliveryService,
    courierName: order.courierName,
    shipping: order.shipping,
    total: order.total,
    lineTotals: order.items.map((item) => item.lineTotal),
  };
  /* Said on the page, not only in the pop-up: the deadline is the thing to
     know *before* deciding whether to open it. */
  const addressNote = (
    <>
      {order.addressChangedAt && (
        <p className="mt-3 text-xs text-muted">
          Delivery address changed {formatMoment(order.addressChangedAt)}.
        </p>
      )}
      {addressEdit.editable && (
        <p className="mt-4 border-t border-line pt-3 text-sm leading-relaxed text-body">
          {addressEdit.until ? (
            <>
              You can change the billing and delivery addresses until{" "}
              <span className="font-semibold text-ink">{formatNoonDeadline(addressEdit.until)}</span>.
            </>
          ) : (
            "You can change the billing and delivery addresses until you pay, and after that until 12 pm the next day."
          )}
        </p>
      )}
    </>
  );
  const deliveryDetail = [order.deliveryService, order.courierName].filter(Boolean).join(" · ");

  return (
    <AccountShell customer={customer}>
      <div>
        {/* The cart is emptied here, not at checkout — this is the first moment
            that is certainly "the order exists". See the component's own note. */}
        {(justPlaced || leftUnpaid) && <ClearCartOnPlaced />}

        {/* Paid at checkout and just landed here: say so in a dialog before
            they start reading the page (client, 2026-09-18). A cash-on-delivery
            order arrives with the same `?placed=` and has paid nothing, so it
            gets the note below and no dialog. */}
        {justPlaced && order.paymentStatus === "paid" && (
          <PaymentSuccessOnArrival
            orderNumber={order.orderNumber}
            amountLabel={formatPaise(order.total)}
            email={customer.email}
          />
        )}

        {leftUnpaid && order.paymentStatus !== "paid" && order.status !== "cancelled" && (
          <div
            role="status"
            className="mb-8 flex items-start gap-4 border border-signal-500 bg-surface-raised px-5 py-5"
          >
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-signal-700" />
            <div>
              <p className="font-medium text-ink">Your payment didn&rsquo;t go through.</p>
              <p className="mt-2 text-sm leading-relaxed text-body">
                Your order is saved here and in your order history, and your cart
                has been emptied so it isn&rsquo;t ordered twice. You can pay for
                it below whenever you&rsquo;re ready.
              </p>
            </div>
          </div>
        )}

        {justPlaced && (
          <div
            role="status"
            className="mb-8 flex items-start gap-4 border border-accent bg-accent-soft px-5 py-5"
          >
            <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="font-medium text-ink">
                Thank you — we have your order.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-body">
                A confirmation is on its way to {customer.email}. Our team will
                call you on {order.shipTo.phone} to confirm the details and
                arrange delivery.
              </p>
            </div>
          </div>
        )}

        <nav aria-label="Breadcrumb" className="mb-6">
          <Link href="/account/orders" className="text-sm text-accent hover:underline">
            ← All orders
          </Link>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h2 className="font-mono text-lg font-semibold tracking-wide text-ink sm:text-xl">
              {order.orderNumber}
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              Placed {formatDate(order.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <OrderStatusBadge order={order} />
            {isAwaitingPayment && <CancelOrderButton orderId={order.id} compact redirectOnDelete />}
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:mt-8 lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-8">
          <div>
            <div className="border border-line bg-surface-raised shadow-card">
            <ReviewFlowProvider orderId={order.id} items={flowItems}>
          <ul className="divide-y divide-line">
              {order.items.map((item) => (
                /* Same shape as the checkout line for the same reason: at
                   390px the thumbnail plus a wrapped product name leaves no
                   room for a third column, so the total moves under the unit
                   price rather than colliding with the name. */
                <li key={item.id} className="p-4 sm:p-5">
                <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden border border-line bg-surface-subtle">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt=""
                        fill
                        sizes="4rem"
                        className="object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-muted">
                        <PanelPlaceholder className="h-6 w-6" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* The name is the snapshot from the order, and the link is
                        to the product it came from. They can disagree — a
                        product renamed since is a different name behind the
                        same link — and the snapshot is what wins on screen,
                        because it is what was bought. A product deleted since
                        has an empty slug and gets no link at all rather than a
                        link to a 404. */}
                    {item.slug ? (
                      <Link
                        href={`/products/${item.slug}`}
                        className="text-sm font-semibold leading-snug text-ink transition-colors hover:text-accent sm:text-base"
                      >
                        {item.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold leading-snug text-ink sm:text-base">
                        {item.name}
                      </span>
                    )}
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-sm text-muted">
                        {formatPaise(item.unitPrice)} × {item.qty}
                      </p>
                      <p className="font-bold tabular-nums text-ink sm:hidden">
                        {formatPaise(item.lineTotal)}
                      </p>
                    </div>
                  </div>

                  {/* The total, and under it the review button — the line's
                      right-hand corner (client, 2026-09-22). The review
                      itself opens in a pop-up, one at a time. */}
                  <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
                    <p className="font-bold tabular-nums text-ink">
                      {formatPaise(item.lineTotal)}
                    </p>
                    {canReview && item.productId && <ItemReviewButton productId={item.productId} />}
                  </div>
                </div>

                {/* Below `sm` the total sits under the name, so the button
                    goes on its own line rather than squeezing beside it. */}
                {canReview && item.productId && (
                  <div className="mt-3 sm:hidden">
                    <ItemReviewButton productId={item.productId} />
                  </div>
                )}
                </li>
              ))}
            </ul>

            </ReviewFlowProvider>

            {order.notes && (
              <div className="border-t border-line px-5 py-4">
                <p className="label-tech text-muted">Your note</p>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-body">
                  {order.notes}
                </p>
              </div>
            )}
            </div>

            {/* Under the items, not inside their card: they act on the order as
                a whole (client, 2026-09-17). */}
            <OrderFooterActions
              items={order.items.map((item) => ({ slug: item.slug, qty: item.qty }))}
            />
          </div>

          <div className="space-y-6">
            {/* One panel when the two are the same place, which is the common
                case and how orders placed before checkout asked separately are
                stored — see the `bill_to` fallback in `lib/db/orders.ts`. Two
                identical panels stacked on top of each other would read as a
                mistake. */}
            {/* Tracking, once the parcel is with a courier. Above the address
                because once something is moving, "where is it" is the question
                the customer opened this page to answer. */}
            {order.status === "cancelled" && (
              <section className="border border-line bg-surface-raised p-5 shadow-card">
                <h3 className="label-tech text-muted">Cancelled</h3>
                <p className="mt-3 text-sm leading-relaxed text-body">
                  This order was cancelled
                  {order.cancelledAt ? ` on ${formatDate(order.cancelledAt)}` : ""} and
                  will not be delivered.
                  {order.paymentStatus === "paid" &&
                    " You paid online, so the full amount will be refunded to the payment method you used — it takes 5–7 days to reach your account."}{" "}
                  Questions? Call{" "}
                  <a href={`tel:${site.phone.href}`} className="text-accent hover:underline">
                    {site.phone.display}
                  </a>
                  .
                </p>
              </section>
            )}

            {/* Tracking, once the parcel is with a courier. Above the address
                because once something is moving, "where is it" is the question
                the customer opened this page to answer. The status and scans
                are the courier's, kept current by Shiprocket's webhook
                (2026-09-17) — this page no longer only links out to them. */}
            {order.awb && order.status !== "cancelled" && (
              <section className="border border-accent bg-accent-soft p-5 shadow-card">
                <h3 className="label-tech text-muted">
                  {order.status === "delivered" ? "Delivered" : "On its way"}
                </h3>
                <p className="mt-3 text-lg font-semibold leading-snug text-ink">
                  {trackingLabel(order.trackingStatus) ??
                    (order.status === "delivered" ? "Delivered" : "Booked with the courier")}
                </p>
                {order.deliveredAt ? (
                  <p className="mt-1 text-sm text-body">
                    Delivered {formatDate(order.deliveredAt)}.
                  </p>
                ) : order.trackingEta ? (
                  <p className="mt-1 text-sm text-body">
                    Expected by {formatDay(order.trackingEta)}.
                  </p>
                ) : order.shippedAt ? (
                  <p className="mt-1 text-sm text-body">
                    Dispatched {formatDate(order.shippedAt)}.
                  </p>
                ) : null}

                <p className="mt-3 text-sm text-body">
                  {order.courierName || "Courier"} ·{" "}
                  <span className="break-all font-mono">{order.awb}</span>
                </p>
                <a
                  href={trackingUrl(order.awb)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex h-10 items-center gap-2 border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-ink"
                >
                  Track this parcel
                </a>

                {order.trackingEvents.length > 0 && (
                  <div className="mt-5 border-t border-line pt-4">
                    <TrackingTimeline events={order.trackingEvents.slice(0, 4)} />
                    {/* The rest folded away: on a phone, a dozen scans would
                        push the address and the total off the screen. */}
                    {order.trackingEvents.length > 4 && (
                      <details className="group mt-3">
                        <summary className="cursor-pointer text-sm text-accent hover:underline">
                          <span className="group-open:hidden">
                            Show {order.trackingEvents.length - 4} earlier update
                            {order.trackingEvents.length - 4 === 1 ? "" : "s"}
                          </span>
                          <span className="hidden group-open:inline">Hide earlier updates</span>
                        </summary>
                        <div className="mt-3">
                          <TrackingTimeline events={order.trackingEvents.slice(4)} />
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* The addresses as cards with an Edit button (client,
                2026-09-18), which opens a pop-up listing the address book —
                choose one, edit one, or add one, as at checkout. Billing is
                always editable (the invoice uses the current details);
                delivery only while `addressEditWindow` says so. One card when
                the two are the same place, with a button for each. */}
            {sameAddress ? (
              <section className="border border-line bg-surface-raised p-5 shadow-card">
                <h3 className="label-tech text-muted">Billing &amp; delivery address</h3>
                <OrderAddress address={order.shipTo} />
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  {editBilling("Edit billing")}
                  {editDelivery("Edit delivery")}
                </div>
                {addressNote}
              </section>
            ) : (
              <>
                <section className="border border-line bg-surface-raised p-5 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="label-tech text-muted">Billed to</h3>
                    {editBilling()}
                  </div>
                  <OrderAddress address={order.billTo} />
                </section>

                <section className="border border-line bg-surface-raised p-5 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="label-tech text-muted">Delivering to</h3>
                    {editDelivery()}
                  </div>
                  <OrderAddress address={order.shipTo} />
                  {addressNote}
                </section>
              </>
            )}

            <section className="border border-line bg-surface-raised p-5 shadow-card">
              <h3 className="label-tech text-muted">Total</h3>
              <dl className="mt-3 divide-y divide-line text-sm">
                <Line label="Subtotal" value={formatPaise(order.subtotal)} />
                <Line label="CGST 9%" value={formatPaise(order.cgst)} muted />
                <Line label="SGST 9%" value={formatPaise(order.sgst)} muted />
                {/* The service by the name it was chosen under, and the courier
                    under it — re-quoted when the address changes. */}
                <div className="flex items-start justify-between gap-3 py-3">
                  <dt className="min-w-0 text-muted">
                    Delivery
                    {deliveryDetail && (
                      <span className="mt-0.5 block text-xs leading-snug">{deliveryDetail}</span>
                    )}
                  </dt>
                  <dd className="shrink-0 tabular-nums text-body">
                    {order.shipping > 0 ? formatPaise(order.shipping) : "To be advised"}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-3.5">
                  <dt className="font-bold text-ink">Total</dt>
                  <dd className="text-lg font-bold text-accent tabular-nums">
                    {formatPaise(order.total)}
                  </dd>
                </div>
                {/* "Refund processing" until Razorpay confirms it, then
                    "Refunded" (2026-09-19). */}
                {order.refundedAmount > 0 && (
                  <div className="flex items-center justify-between py-3">
                    <dt className="text-muted">
                      {order.refundPending
                        ? "Refund processing"
                        : `Refunded${order.refundedAt ? ` ${formatDate(order.refundedAt)}` : ""}`}
                    </dt>
                    <dd className="font-semibold tabular-nums text-ink">
                      −{formatPaise(order.refundedAmount)}
                    </dd>
                  </div>
                )}
              </dl>

              {/* `failed` as well as `unpaid`: a declined card is exactly when
                  somebody needs to try again. The server always allowed it —
                  `/api/payment/create` refuses only paid or cancelled orders,
                  and `markOrderPaid` accepts anything not yet paid — but this
                  used to test for `unpaid` alone, so the button vanished after
                  the first failed attempt and the customer was stuck. */}
              {(order.paymentStatus === "unpaid" || order.paymentStatus === "failed") &&
                order.status !== "cancelled" && (
                <div className="mt-4 border-t border-line pt-4">
                  {order.paymentProvider === "cod" ? (
                    <p className="text-sm leading-relaxed text-muted">
                      Payment to be collected on delivery.
                    </p>
                  ) : (
                    <>
                      {order.paymentStatus === "failed" && (
                        <p className="mb-3 text-sm leading-relaxed text-body">
                          Your last payment attempt did not go through. You can try again.
                        </p>
                      )}
                      {payOnline ? (
                        <>
                          <PayNowButton
                            orderId={order.id}
                            amountLabel={formatPaise(order.total)}
                          />
                          <p className="mt-3 text-sm leading-relaxed text-muted">
                            Pay by UPI, card or netbanking. Prefer to pay on a call?
                            Ring us on{" "}
                            <a
                              href={`tel:${site.phone.href}`}
                              className="text-accent hover:underline"
                            >
                              {site.phone.display}
                            </a>
                            .
                          </p>
                        </>
                      ) : (
                        <p className="text-sm leading-relaxed text-muted">
                          Payment is arranged when we call. Questions in the meantime —{" "}
                          <a
                            href={`tel:${site.phone.href}`}
                            className="text-accent hover:underline"
                          >
                            {site.phone.display}
                          </a>
                          .
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AccountShell>
  );
}

function Line({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className={muted ? "text-muted" : "font-semibold text-ink"}>{label}</dt>
      <dd className={`tabular-nums ${muted ? "text-body" : "font-semibold text-ink"}`}>
        {value}
      </dd>
    </div>
  );
}

function TrackingTimeline({ events }: { events: Order["trackingEvents"] }) {
  return (
    <ol className="space-y-3">
      {events.map((event, index) => (
        <li key={`${event.at}-${index}`} className="relative pl-5">
          <span
            aria-hidden
            className="absolute left-0 top-1.5 h-2 w-2 rounded-full border border-accent bg-surface"
          />
          <p className="text-sm leading-snug text-ink">{event.activity}</p>
          {(event.location || event.at) && (
            <p className="mt-0.5 text-xs text-muted">
              {[event.location, event.at ? formatMoment(event.at) : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
