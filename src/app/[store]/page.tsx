import { notFound } from "next/navigation";
import { getStoreBySlug, listStoreProducts } from "@/lib/db/stores";
import { getGstRates } from "@/lib/db/settings";
import { currentStore } from "@/lib/store-auth";
import { StoreSignIn } from "./StoreSignIn";
import { StockList } from "./StockList";

export const dynamic = "force-dynamic";

/**
 * **Stocks** — what this store has on its shelves, and the page it opens on
 * (client, 2026-09-26: "instead of opening inventory tab it should open stocks
 * tab where only product list which we can move up and down, enter stock
 * amount, - and + button").
 *
 * Signed out, the same address is the sign-in. One page, because the store's
 * name in the URL is what somebody was given and it should work whichever
 * state they are in.
 */
export default async function StorePage({
  params,
}: {
  params: Promise<{ store: string }>;
}) {
  const { store: slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const session = await currentStore();
  if (!session || session.slug !== store.slug || store.blockedAt) {
    return (
      <StoreSignIn slug={store.slug} name={store.nickname} blocked={Boolean(store.blockedAt)} />
    );
  }

  const [rows, rates] = await Promise.all([listStoreProducts(store.id), getGstRates()]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Stocks</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length === 0
              ? "Nothing on the shelves yet."
              : `${rows.length} product${rows.length === 1 ? "" : "s"} · ${rows.reduce(
                  (sum, row) => sum + row.qty,
                  0,
                )} in stock`}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <StockList rows={rows} rates={rates} slug={store.slug} />
      </div>
    </>
  );
}
