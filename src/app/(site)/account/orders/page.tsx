import Link from "next/link";
import { ArrowRightIcon, PackageIcon } from "@/components/icons/ui";
import { OrderHistoryTable } from "@/components/account/OrderHistoryTable";
import { AccountShell } from "@/components/account/AccountShell";
import { requireSignIn } from "@/lib/account";
import { listOrdersForCustomer } from "@/lib/db/orders";
import { reviewedProductIds } from "@/lib/db/reviews";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Order history",
  description: "Everything you have ordered from Vkon Automation.",
  path: "/account/orders",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const customer = await requireSignIn("/account/orders");
  const [orders, reviewed] = await Promise.all([
    listOrdersForCustomer(customer.id),
    /* So a delivered order can offer "Write reviews" for what is left, and
       skip what is already done (client, 2026-09-22). */
    reviewedProductIds(customer.id),
  ]);

  return (
    <AccountShell customer={customer}>
      <div>
        <h2 className="text-xl font-semibold text-ink sm:text-2xl">Order history</h2>

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
          <OrderHistoryTable orders={orders} reviewed={[...reviewed]} />
        )}
      </div>
    </AccountShell>
  );
}
