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
        <h2 className="text-xl font-semibold text-ink">Order history</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Every order you have placed, newest first.
        </p>

        {orders.length === 0 ? (
          <div className="mt-8 border border-line bg-surface-raised px-6 py-16 text-center shadow-card">
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
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
                  <div>
                    <p className="font-mono text-sm font-semibold tracking-wide text-ink">
                      {order.orderNumber}
                    </p>
                    <p className="mt-1 text-sm text-muted">{formatDate(order.createdAt)}</p>
                  </div>
                  <OrderStatusBadge
                    status={order.status}
                    paymentStatus={order.paymentStatus}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-6">
                  {/* Four thumbnails at most, then a count. A ten-line order
                      would otherwise turn a summary row into a gallery. */}
                  <ul className="flex shrink-0 items-center gap-2">
                    {order.items.slice(0, 4).map((item) => (
                      <li
                        key={item.id}
                        className="relative h-14 w-14 overflow-hidden border border-line bg-surface-subtle"
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
                            <PanelPlaceholder className="h-5 w-5" />
                          </span>
                        )}
                      </li>
                    ))}
                    {order.items.length > 4 && (
                      <li className="flex h-14 w-14 items-center justify-center border border-line bg-surface-subtle text-xs font-semibold text-muted">
                        +{order.items.length - 4}
                      </li>
                    )}
                  </ul>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-body">
                      {order.items.map((item) => item.name).join(", ")}
                    </p>
                    <p className="mt-1 text-lg font-bold text-accent tabular-nums">
                      {formatPaise(order.total)}
                    </p>
                  </div>

                  <Link
                    href={`/account/orders/${order.id}`}
                    className="inline-flex h-10 shrink-0 items-center gap-2 border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
                  >
                    View
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AccountShell>
  );
}
