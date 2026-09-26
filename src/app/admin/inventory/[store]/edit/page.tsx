import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Crumbs } from "../../Crumbs";
import { requireInventoryPage } from "@/lib/auth";
import { getGstRates } from "@/lib/db/settings";
import { getStoreBySlug } from "@/lib/db/stores";
import { StoreForm } from "../../StoreForm";

export const dynamic = "force-dynamic";

export default async function EditStorePage({
  params,
}: {
  params: Promise<{ store: string }>;
}) {
  await requireInventoryPage();
  const { store: slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const rates = await getGstRates();

  return (
    <Container size="wide">
      <Crumbs
        trail={[
          { label: "Inventory", href: "/admin/inventory" },
          { label: store.nickname, href: `/admin/inventory/${store.slug}` },
          { label: "Edit" },
        ]}
      />

      <h1 className="text-2xl">Edit {store.nickname}</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Fetch the address again to take Shiprocket&rsquo;s current record, or change
        any of it by hand. The store&rsquo;s page address does not change.
      </p>

      {store.blockedAt && (
        <p role="status" className="mt-4 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-ink">
          This store is blocked, so changes are refused. Unblock it from the
          inventory list first.
        </p>
      )}

      <div className="mt-6 max-w-4xl">
        <StoreForm store={store} products={[]} rates={rates} />
      </div>
    </Container>
  );
}
