import { AddressBook } from "@/components/account/AddressBook";
import { AccountShell } from "@/components/account/AccountShell";
import { requireSignIn } from "@/lib/account";
import { listAddresses } from "@/lib/db/addresses";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Addresses",
  description: "The places you take delivery.",
  path: "/account/addresses",
  noIndex: true,
});

export const dynamic = "force-dynamic";

/**
 * The address book, on its own page (client, 2026-09-23).
 *
 * It was a panel at the foot of My account, and this route was a redirect to
 * that anchor. It is a list a customer keeps — add one, edit one, choose the
 * default — which is the same shape as their orders, not a detail of their
 * profile, so it sits between the two in the account nav.
 */
export default async function AddressesPage() {
  const customer = await requireSignIn("/account/addresses");
  const addresses = await listAddresses(customer.id);

  return (
    <AccountShell customer={customer}>
      <section className="border border-line bg-surface-raised p-5 shadow-card sm:p-8">
        <h2 className="text-lg font-semibold text-ink sm:text-xl">Delivery addresses</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Save the places you take delivery. The one chosen here is your
          default, and checkout starts with it.
        </p>
        <div className="mt-6">
          <AddressBook addresses={addresses} />
        </div>
      </section>
    </AccountShell>
  );
}
