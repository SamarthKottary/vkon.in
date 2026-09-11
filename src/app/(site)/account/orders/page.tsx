import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, PackageIcon } from "@/components/icons/ui";
import { OrderStatusBadge } from "@/components/account/OrderStatusBadge";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { AccountShell } from "@/components/account/AccountShell";
import { requireSignIn } from "@/lib/account";
import { listOrdersForCustomer } from "@/lib/db/orders";
import { formatPaise } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Order history",
  description: "Everything you have ordered from Vkon Automation.",
  path: "/account/orders",
  noIndex: true,
});

export const dynamic = "force-dynamic";

/** Dates render as "6 September 2026" in en-IN, on the server, so the string
 *  is the same in the HTML and after hydration. Formatting a date in the
 *  browser instead means the server's locale and the visitor's disagree and
 *  React reports a hydration mismatch. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function OrdersPage() {
  const customer = await requireSignIn("/account/orders");
  const orders = await listOrdersForCustomer(customer.id);

  return (
    <AccountShell customer={customer}>
      <div>
        <h2 className="text-xl font-semibold text-ink sm:text-2xl">Order history</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Every order you have placed, newest first.
        </p>

        {orders.length === 0 ? (
          <div className="mt-8 border border-line bg-surface-raised px-6 py-14 text-center shadow-card sm:py-16">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-subtle text-muted">
              <PackageIcon className="h-7 w-7" />
            </span>
            <p className="mt-5 text-lg font-bold text-ink">No orders yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
              When you place an order it will appear here, with what you ordered
              and where it is going.
            </p>
            <Link
              href="/products"
              className="mt-7 inline-flex h-11 items-center justify-center gap-2 bg-accent px-6 text-sm font-bold uppercase tracking-wider text-surface shadow-sm transition-colors hover:bg-accent-strong"
            >
              Browse products
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-5">
            {orders.map((order) => (
              <li key={order.id} className="border border-line bg-surface-raised shadow-card">
                {/* Header: reference and date on the left, status on the right.
                    The badges wrap onto their own line below `sm` rather than
                    squeezing the order number, which is the one string on this
                    card a customer reads out on the phone. */}
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 border-b border-line px-4 py-3.5 sm:px-6 sm:py-4">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold tracking-wide text-ink sm:text-base">
                      {order.orderNumber}
                    </p>
                    <p className="mt-1 text-xs text-muted sm:text-sm">
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <OrderStatusBadge
                    status={order.status}
                    paymentStatus={order.paymentStatus}
                  />
                </div>

                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-start gap-3 sm:gap-4">
                    {/* Four thumbnails at most, then a "+n" tile. */}
                    <ul className="flex shrink-0 items-center gap-1.5">
                      {order.items.slice(0, 4).map((item) => (
                        <li
                          key={item.id}
                          className="relative h-12 w-12 overflow-hidden border border-line bg-surface-subtle sm:h-14 sm:w-14"
                        >
                          {item.imageUrl ? (
                            <Image
                              src={item.imageUrl}
                              alt=""
                              fill
                              sizes="3.5rem"
                              className="object-cover"
                            />
                          ) : (
                            <span className="absolute inset-0 flex items-center justify-center text-muted">
                              <PanelPlaceholder className="h-4 w-4" />
                            </span>
                          )}
                        </li>
                      ))}
                      {order.items.length > 4 && (
                        <li className="flex h-12 w-12 items-center justify-center border border-line bg-surface-subtle text-xs font-semibold text-muted sm:h-14 sm:w-14">
                          +{order.items.length - 4}
                        </li>
                      )}
                    </ul>

                    {/* The names sit beside the thumbnails, not under them:
                        that empty gutter was the whole width of the card. Two
                        lines then ellipsis, so a five-line order does not make
                        one row taller than the rest of the list. */}
                    <p className="line-clamp-2 min-w-0 flex-1 text-sm leading-relaxed text-body">
                      {order.items.map((item) => item.name).join(", ")}
                    </p>
                  </div>

                  {/* Total and the way in, on their own row with a rule above.
                      Side by side with the thumbnails they were pinched into
                      whatever was left at 390px, with the price and the button
                      touching. */}
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5">
                    <div className="min-w-0">
                      <p className="label-tech text-muted">Total</p>
                      <p className="mt-0.5 text-lg font-bold tabular-nums text-accent sm:text-xl">
                        {formatPaise(order.total)}
                      </p>
                    </div>
                    <Link
                      href={`/account/orders/${order.id}`}
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
                    >
                      View order
                      <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AccountShell>
  );
}
