import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { PickupDetailList } from "@/app/admin/inventory/StoreForm";
import { getGstRates } from "@/lib/db/settings";
import { listProducts } from "@/lib/db/products";
import { getStoreBySlug, listStoreProducts } from "@/lib/db/stores";
import { requireStore } from "@/lib/store-auth";
import { StoreProducts } from "../StoreProducts";

export const dynamic = "force-dynamic";

/**
 * The store's own details, behind the profile icon (client, 2026-09-26: "it
 * will be like the current inventory, but only can see the product list like
 * now and also add product button... But no edit, block, delete buttons").
 *
 * Read-only about itself: the address, the pickup in-charge and what Shiprocket
 * holds are fetched by the office and are not this page's to change. The one
 * thing a store may do here is say what it stocks.
 */
export default async function StoreProfilePage({
  params,
}: {
  params: Promise<{ store: string }>;
}) {
  const { store: slug } = await params;
  const exists = await getStoreBySlug(slug);
  if (!exists) notFound();

  const store = await requireStore(slug);
  const [rows, products, rates] = await Promise.all([
    listStoreProducts(store.id),
    listProducts({ includeUnpublished: true }),
    getGstRates(),
  ]);

  const address = [store.line1, store.line2, store.city, store.state, store.postalCode, store.country]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <section className="border border-line bg-surface-raised p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl">{store.nickname}</h1>
              {store.pickupId && <Badge>Shiprocket</Badge>}
            </div>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-body">{address}</p>
            <p className="mt-1 text-sm text-muted">
              {[
                [store.contactRole, store.contactName].filter(Boolean).join(", "),
                store.phone,
                store.email,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {store.notes && <p className="mt-2 text-sm text-body">{store.notes}</p>}
            <PickupDetailList details={store.pickup} />
          </div>

          <dl className="flex shrink-0 gap-8 text-right">
            <div className="min-w-[4.5rem]">
              <dt className="label-tech text-muted">Products</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
                {rows.length || "—"}
              </dd>
            </div>
            <div className="min-w-[4.5rem]">
              <dt className="label-tech text-muted">In stock</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
                {rows.reduce((sum, row) => sum + row.qty, 0)}
              </dd>
            </div>
          </dl>
        </div>

        <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
          These details come from this store&rsquo;s pickup address at Shiprocket.
          Ask the office to change them.
        </p>
      </section>

      <h2 className="mt-8 text-base font-semibold text-ink">What this store holds</h2>
      <p className="mt-1 text-sm text-muted">
        Add what is stocked here. The counts are on the Stocks page.
      </p>

      <div className="mt-4">
        <StoreProducts rows={rows} products={products} rates={rates} />
      </div>
    </>
  );
}
