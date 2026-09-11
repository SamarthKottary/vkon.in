import Link from "next/link";
import { CheckIcon, LockIcon, PackageIcon, PinIcon } from "@/components/icons/ui";
import { ProfileForm } from "@/components/account/ProfileForm";
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

        <div className="grid gap-5 sm:grid-cols-2">
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
            href="/account/addresses"
            icon={<PinIcon className="h-5 w-5" />}
            label="Addresses"
            value={addresses.length === 0 ? "None saved" : `${addresses.length}`}
            detail={
              addresses.find((a) => a.isDefault)
                ? `Default: ${addresses.find((a) => a.isDefault)?.city}`
                : "Save one to make checkout quicker."
            }
          />
        </div>

        <section className="border border-line bg-surface-raised p-6 shadow-card sm:p-8">
          <h2 className="text-lg font-semibold text-ink">Your details</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The name and number we use when we call about an order.
          </p>
          <div className="mt-6 max-w-md">
            <ProfileForm name={customer.name} phone={customer.phone} />
          </div>
        </section>

        <section className="border border-line bg-surface-raised p-6 shadow-card sm:p-8">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink">
            <LockIcon className="h-5 w-5 text-muted" />
            Sign-in
          </h2>

          <dl className="mt-5 divide-y divide-line text-sm">
            <Row label="Email">
              <span className="text-ink">{customer.email}</span>{" "}
              {customer.emailVerified ? (
                <span className="ml-1 text-accent">confirmed</span>
              ) : (
                <span className="ml-1 text-muted">not yet confirmed</span>
              )}
            </Row>
            <Row label="Password">
              {customer.hasPassword ? (
                <>
                  <span className="text-ink">Set</span>
                  {" · "}
                  <Link href="/account/forgot" className="text-accent hover:underline">
                    change it
                  </Link>
                </>
              ) : (
                /* A Google-only account. `/account/forgot` is the route to a
                   password here as much as it is a recovery route: it mails a
                   link, and the link sets one. Saying "set a password" rather
                   than "forgot" is the honest label for what it does for them. */
                <>
                  <span className="text-muted">None — you sign in with Google</span>
                  {" · "}
                  <Link href="/account/forgot" className="text-accent hover:underline">
                    set one
                  </Link>
                </>
              )}
            </Row>
            <Row label="Google">
              {customer.hasGoogle ? (
                <span className="text-ink">Linked</span>
              ) : (
                <span className="text-muted">Not linked</span>
              )}
            </Row>
          </dl>
        </section>
      </div>
    </AccountShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3.5">
      <dt className="label-tech w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-body">{children}</dd>
    </div>
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
      className="group border border-line bg-surface-raised p-6 shadow-card transition-colors hover:border-ink"
    >
      <span className="flex items-center gap-2.5 text-muted transition-colors group-hover:text-accent">
        {icon}
        <span className="label-tech">{label}</span>
      </span>
      <p className="mt-4 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1.5 text-sm text-muted">{detail}</p>
    </Link>
  );
}
