import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckIcon } from "@/components/icons/ui";
import { OrderStatusBadge } from "@/components/account/OrderStatusBadge";
import { ClearCartOnPlaced } from "@/components/cart/ClearCartOnPlaced";
import { PayNowButton } from "@/components/checkout/PayNowButton";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { AccountShell } from "@/components/account/AccountShell";
import { OrderAddress, sameOrderAddress } from "@/components/account/OrderAddress";
import { requireSignIn } from "@/lib/account";
import { getOrderForCustomer } from "@/lib/db/orders";
import { formatPaise } from "@/lib/pricing";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { trackingUrl } from "@/lib/shiprocket";
import { site } from "@/content/site";
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

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { id } = await params;
  const customer = await requireSignIn(`/account/orders/${id}`);

  /* Scoped to the owner inside the query, not checked afterwards — see the
     note on `getOrderForCustomer`. Somebody else's order id is a 404 here,
     which is also the right answer: "not found" and "not yours" should be
     indistinguishable, or the page becomes a way to test which ids exist. */
  const order = await getOrderForCustomer(customer.id, id);
  if (!order) notFound();

  const { placed } = await searchParams;
  const justPlaced = placed === order.orderNumber;

  /* Read on the server: `isRazorpayConfigured` looks at the secret, which must
     never reach the browser. Only the boolean crosses. */
  const payOnline = isRazorpayConfigured();
  const sameAddress = sameOrderAddress(order.billTo, order.shipTo);

  return (
    <AccountShell customer={customer}>
      <div>
        {/* The cart is emptied here, not at checkout — this is the first moment
            that is certainly "the order exists". See the component's own note. */}
        {justPlaced && <ClearCartOnPlaced />}

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
          <OrderStatusBadge status={order.status} paymentStatus={order.paymentStatus} />
        </div>

        <div className="mt-6 grid gap-6 sm:mt-8 lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-8">
          <div className="border border-line bg-surface-raised shadow-card">
            <ul className="divide-y divide-line">
              {order.items.map((item) => (
                /* Same shape as the checkout line for the same reason: at
                   390px the thumbnail plus a wrapped product name leaves no
                   room for a third column, so the total moves under the unit
                   price rather than colliding with the name. */
                <li key={item.id} className="flex items-start gap-3 p-4 sm:items-center sm:gap-4 sm:p-5">
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

                  <p className="hidden shrink-0 font-bold tabular-nums text-ink sm:block">
                    {formatPaise(item.lineTotal)}
                  </p>
                </li>
              ))}
            </ul>

            {order.notes && (
              <div className="border-t border-line px-5 py-4">
                <p className="label-tech text-muted">Your note</p>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-body">
                  {order.notes}
                </p>
              </div>
            )}
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
            {order.awb && (
              <section className="border border-accent bg-accent-soft p-5 shadow-card">
                <h3 className="label-tech text-muted">On its way</h3>
                <p className="mt-3 font-semibold text-ink">
                  {order.courierName || "Courier"}
                </p>
                <p className="mt-1 break-all font-mono text-sm text-body">{order.awb}</p>
                <a
                  href={trackingUrl(order.awb)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex h-10 items-center gap-2 border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-ink"
                >
                  Track this parcel
                </a>
                {order.deliveredAt ? (
                  <p className="mt-3 text-sm text-body">
                    Delivered {formatDate(order.deliveredAt)}.
                  </p>
                ) : order.shippedAt ? (
                  <p className="mt-3 text-sm text-body">
                    Dispatched {formatDate(order.shippedAt)}.
                  </p>
                ) : null}
              </section>
            )}

            {sameAddress ? (
              <section className="border border-line bg-surface-raised p-5 shadow-card">
                <h3 className="label-tech text-muted">Billing &amp; delivery address</h3>
                <OrderAddress address={order.shipTo} />
              </section>
            ) : (
              <>
                <section className="border border-line bg-surface-raised p-5 shadow-card">
                  <h3 className="label-tech text-muted">Billed to</h3>
                  <OrderAddress address={order.billTo} />
                </section>

                <section className="border border-line bg-surface-raised p-5 shadow-card">
                  <h3 className="label-tech text-muted">Delivering to</h3>
                  <OrderAddress address={order.shipTo} />
                </section>
              </>
            )}

            <section className="border border-line bg-surface-raised p-5 shadow-card">
              <h3 className="label-tech text-muted">Total</h3>
              <dl className="mt-3 divide-y divide-line text-sm">
                <Line label="Subtotal" value={formatPaise(order.subtotal)} />
                <Line label="CGST 9%" value={formatPaise(order.cgst)} muted />
                <Line label="SGST 9%" value={formatPaise(order.sgst)} muted />
                <Line
                  label={order.courierName ? `Delivery · ${order.courierName}` : "Delivery"}
                  value={order.shipping > 0 ? formatPaise(order.shipping) : "To be advised"}
                  muted
                />
                <div className="flex items-center justify-between py-3.5">
                  <dt className="font-bold text-ink">Total</dt>
                  <dd className="text-lg font-bold text-accent tabular-nums">
                    {formatPaise(order.total)}
                  </dd>
                </div>
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
