import Link from "next/link";
import { CheckIcon, PackageIcon, PinIcon } from "@/components/icons/ui";
import { PasswordCard } from "@/components/account/PasswordCard";
import { ProfileForm } from "@/components/account/ProfileForm";
import { AddressBook } from "@/components/account/AddressBook";
import { AccountShell } from "@/components/account/AccountShell";
import { requireSignIn } from "@/lib/account";
import { listAddresses } from "@/lib/db/addresses";
import { listOrdersForCustomer } from "@/lib/db/orders";
import { formatPaise } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "My account",
  description: "Your Vkon Automation account.",
  path: "/account",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; verified?: string }>;
}) {
  const customer = await requireSignIn("/account");
  const params = await searchParams;

  const [orders, addresses] = await Promise.all([
    listOrdersForCustomer(customer.id),
    listAddresses(customer.id),
  ]);

  const latest = orders[0];

  return (
    <AccountShell customer={customer}>
      <div className="space-y-10">
        {(params.reset || params.verified) && (
          <p
            role="status"
            className="flex items-start gap-3 border border-accent bg-accent-soft px-5 py-4 text-sm text-ink"
          >
            <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            {params.reset
              ? "Your password has been changed, and you have been signed out everywhere else."
              : "Thank you — your email address is confirmed."}
          </p>
        )}

        {/* Two up at every width, including 390px. Stacked, these two cards
            were most of a phone screen between the greeting and "Your
            details" — a lot of scroll for two numbers. Side by side they read
            as the summary strip they are. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          <SummaryCard
            href="/account/orders"
            icon={<PackageIcon className="h-5 w-5" />}
            label="Orders"
            value={orders.length === 0 ? "None yet" : `${orders.length}`}
            detail={
              latest
                ? `Latest: ${latest.orderNumber} · ${formatPaise(latest.total)}`
                : "Your order history will appear here."
            }
          />
          <SummaryCard
            href="#addresses"
            icon={<PinIcon className="h-5 w-5" />}
            label="Addresses"
            value={addresses.length === 0 ? "None saved" : `${addresses.length}`}
            detail={
              addresses.find((a) => a.isDefault)
                ? `Default: ${addresses.find((a) => a.isDefault)?.city}`
                : "Save one below to make checkout quicker."
            }
          />
        </div>

        <section className="border border-line bg-surface-raised p-5 shadow-card sm:p-8">
          <h2 className="text-lg font-semibold text-ink sm:text-xl">Your details</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The name and number we use when we call about an order.
          </p>
          <div className="mt-6 max-w-md">
            <ProfileForm
              name={customer.name}
              phone={customer.phone}
              email={customer.email}
              hasGoogle={customer.hasGoogle}
            />
          </div>

          {/* Its own form, a sibling rather than a child of the one above:
              nesting them would make Save submit whichever the browser kept,
              the same trap CheckoutForm records at length. */}
          <div className="mt-8">
            <PasswordCard
              hasGoogle={customer.hasGoogle}
              hasPassword={customer.hasPassword}
            />
          </div>
        </section>

        <section id="addresses" className="border border-line bg-surface-raised p-5 shadow-card sm:p-8">
          <h2 className="text-lg font-semibold text-ink sm:text-xl">Delivery addresses</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Save the places you take delivery. The one chosen here is your
            default, and checkout starts with it.
          </p>
          <div className="mt-6">
            <AddressBook addresses={addresses} />
          </div>
        </section>
      </div>
    </AccountShell>
  );
}

function SummaryCard({
  href,
  icon,
  label,
  value,
  detail,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col border border-line bg-surface-raised p-4 shadow-card transition-colors hover:border-ink sm:p-6"
    >
      <span className="flex items-center gap-2 text-muted transition-colors group-hover:text-accent sm:gap-2.5">
        <span className="shrink-0">{icon}</span>
        <span className="label-tech truncate">{label}</span>
      </span>
      <p className="mt-3 text-xl font-semibold text-ink sm:mt-4 sm:text-2xl">{value}</p>
      {/* `break-words`: at two-up on a 390px phone each card is ~175px, and an
          order number plus a total is longer than that. */}
      <p className="mt-1.5 break-words text-xs leading-relaxed text-muted sm:text-sm">
        {detail}
      </p>
    </Link>
  );
}
