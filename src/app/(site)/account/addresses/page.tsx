import { AccountShell } from "@/components/account/AccountShell";
import { AddressBook } from "@/components/account/AddressBook";
import { requireSignIn } from "@/lib/account";
import { listAddresses } from "@/lib/db/addresses";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Addresses",
  description: "Your saved delivery addresses.",
  path: "/account/addresses",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const customer = await requireSignIn("/account/addresses");
  const addresses = await listAddresses(customer.id);

  return (
    <AccountShell customer={customer}>
      <div>
        <h2 className="text-xl font-semibold text-ink">Delivery addresses</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Save the places you take delivery, and checkout becomes one tap. The
          default is the one already selected when you get there.
        </p>

        <div className="mt-8">
          <AddressBook addresses={addresses} />
        </div>
      </div>
    </AccountShell>
  );
}
