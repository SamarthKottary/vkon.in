import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { requireInventoryPage } from "@/lib/auth";
import { listProducts } from "@/lib/db/products";
import { getGstRates } from "@/lib/db/settings";
import { getStoreBySlug, listStoreProducts } from "@/lib/db/stores";
import { Crumbs } from "../Crumbs";
import { PickupDetailList } from "../StoreForm";
import { StoreRowActions } from "../StoreRowActions";
import { AddProductsToStore } from "./AddProductsToStore";
import { StoreStockList } from "./StoreStockList";

export const dynamic = "force-dynamic";

/**
 * One store: what it is, and what it holds (client, 2026-09-26: "there will be
 * store name, address details and other details at top and then below it there
 * will be product list which he has previously included").
 */
export default async function StorePage({
  params,
}: {
  params: Promise<{ store: string }>;
}) {
  await requireInventoryPage();
  const { store: slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const [rows, products, rates] = await Promise.all([
    listStoreProducts(store.id),
    listProducts({ includeUnpublished: true }),
    getGstRates(),
  ]);
  const frozen = Boolean(store.blockedAt);
  const address = [store.line1, store.line2, store.city, store.state, store.postalCode, store.country]
    .filter(Boolean)
    .join(", ");

  return (
    <Container size="wide">
      <Crumbs trail={[{ label: "Inventory", href: "/admin/inventory" }, { label: store.nickname }]} />

      <section
        className={`border bg-surface-raised p-5 ${frozen ? "border-signal-500" : "border-line"}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl">{store.nickname}</h1>
              {frozen && <Badge tone="warn">Blocked</Badge>}
              {store.pickupId && <Badge>Shiprocket</Badge>}
            </div>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-body">{address}</p>
            {(store.contactName || store.phone || store.email) && (
              <p className="mt-1 text-sm text-muted">
                {/* Role first, then who it is — same as the list. */}
                {[
                  [store.contactRole, store.contactName].filter(Boolean).join(", "),
                  store.phone,
                  store.email,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {store.notes && <p className="mt-2 text-sm text-body">{store.notes}</p>}
            {/* Shiprocket's own settings for this address — where returns go,
                when it may be collected (client, 2026-09-26). */}
            <PickupDetailList details={store.pickup} />
          </div>

          {/* Right-aligned, label over figure, each in its own fixed column
              (client, 2026-09-26: "align the Products 2"). Numbers read down
              their own right edge instead of drifting with the label's
              width. */}
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

        {/* Who signs in to this store, and where (client, 2026-09-26). The
            account is the pickup in-charge's email, so a store with no email on
            its address cannot be signed into at all — which is worth saying
            here rather than leaving somebody to discover it at the shelf. */}
        <div className="mt-4 border-t border-line pt-4 text-sm">
          <p className="label-tech text-muted">Store sign-in</p>
          {store.email ? (
            <p className="mt-1 leading-relaxed text-body">
              <a
                href={`/${store.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-accent hover:underline"
              >
                vkon.in/{store.slug}
              </a>{" "}
              — signs in as{" "}
              <span className="font-medium text-ink">{store.email}</span>, the pickup
              in-charge on this address. The first time, they press{" "}
              <span className="font-medium text-ink">Set or reset password</span> and
              follow the emailed link.
            </p>
          ) : (
            <p className="mt-1 leading-relaxed text-signal-700">
              This store has no email address, so nobody can sign in to it. Fetch
              it from Shiprocket, or add one under Edit.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          {frozen ? (
            <p className="text-sm text-muted">
              Blocked — nothing in this store can be changed until it is unblocked.
            </p>
          ) : (
            <AddProductsToStore
              storeId={store.id}
              rates={rates}
              held={rows.map((row) => row.productId)}
              products={products.map((product) => ({
                id: product.id,
                name: product.name,
                category: product.category,
                image: product.images[0]?.url ?? null,
                price: product.price,
                discountPercent: product.discountPercent,
                published: product.published,
              }))}
            />
          )}
          <StoreRowActions store={store} showView={false} />
        </div>
      </section>

      <h2 className="mt-8 text-base font-semibold text-ink">What this store holds</h2>
      <p className="mt-1 text-sm text-muted">
        Drag a row, or use the arrows, to put them in the order they are walked
        past. Edit sets how many are on the shelf.
      </p>

      <div className="mt-4">
        <StoreStockList storeId={store.id} rows={rows} rates={rates} frozen={frozen} />
      </div>
    </Container>
  );
}
