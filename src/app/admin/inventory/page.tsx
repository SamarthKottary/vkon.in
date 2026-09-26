import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { InfoNote } from "@/components/admin/InfoNote";
import { LoginForm } from "@/app/admin/LoginForm";
import { canSeeInventory, getAdminSession } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listStores } from "@/lib/db/stores";
import { isShiprocketConfigured } from "@/lib/shiprocket";
import { StoreRowActions } from "./StoreRowActions";

export const dynamic = "force-dynamic";

/**
 * The stores, and the sign-in in front of them (client, 2026-09-26: "lets
 * create another section in admin called inventory... there should be a login
 * page, where only users assigned as inventory users by super admin can
 * login").
 *
 * **This page is its own sign-in** rather than a redirect to `/admin`, because
 * it is the address the shop floor is given: someone opening it on a phone in
 * the warehouse should see a form, not the shop's admin asking who they are.
 * The credentials and the session are the ordinary admin ones — there is one
 * account table and one cookie — and the role decides what opens afterwards.
 *
 * A signed-in operator whose role has no stores is told so, in place, rather
 * than being bounced: knowing you are signed in as the wrong person is the
 * useful half of the answer.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; store?: string }>;
}) {
  const { q = "", error, store: flagged = "" } = await searchParams;
  const admin = await getAdminSession();

  if (!admin) {
    return (
      <Container size="narrow">
        <div className="mx-auto max-w-sm border border-line bg-surface-raised p-8">
          <h1 className="text-2xl">Inventory sign-in</h1>
          <p className="mt-2 text-sm text-muted">
            Stock and store locations for vkon.in. Your account has to be given
            inventory access by a super user.
          </p>
          <div className="mt-6">
            <LoginForm next="/admin/inventory" />
          </div>
        </div>
      </Container>
    );
  }

  if (!canSeeInventory(admin)) {
    return (
      <Container size="wide">
        <div className="border border-line bg-surface p-8">
          <h1 className="text-2xl">Inventory</h1>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-body">
            You are signed in as <span className="font-medium text-ink">{admin.email}</span>,
            whose role is <span className="font-medium text-ink">{admin.role}</span>. The stores
            are for inventory users, admins and super users. Ask a super user to
            give this account inventory access, or{" "}
            <Link href="/admin/products" className="text-accent hover:underline">
              go back to the admin
            </Link>
            .
          </p>
        </div>
      </Container>
    );
  }

  const stores = await listStores(q);
  const blocked = stores.filter((one) => one.blockedAt).length;

  return (
    <Container size="wide">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Inventory</h1>
          <p className="mt-1 text-sm text-muted">
            {stores.length} {q ? "matching" : "store"}
            {stores.length === 1 && !q ? "" : q ? "" : "s"}
            {blocked > 0 && ` · ${blocked} blocked`}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* A plain GET form, like the other admin lists: the view lives in
              the URL and it works before any JavaScript arrives. */}
          <form action="/admin/inventory" className="flex min-w-0 flex-1 gap-2 sm:flex-initial">
            <label htmlFor="store-search" className="sr-only">
              Search stores
            </label>
            <input
              id="store-search"
              name="q"
              defaultValue={q}
              placeholder="Name, town or PIN code"
              className="h-10 min-w-0 flex-1 border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink sm:w-64"
            />
            <button
              type="submit"
              className="h-10 shrink-0 border border-line-strong px-4 text-sm font-medium text-ink hover:border-ink hover:bg-surface-subtle"
            >
              Search
            </button>
          </form>

          <Link
            href="/admin/inventory/new"
            className="inline-flex h-10 shrink-0 items-center gap-2 border border-accent bg-accent px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent-strong"
          >
            Add store
          </Link>
        </div>
      </div>

      {!isDatabaseConfigured() && (
        <div className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm">
          <p className="font-medium text-ink">No database configured</p>
        </div>
      )}

      {error === "gone" && (
        <p role="status" className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-ink">
          That store no longer exists.
        </p>
      )}

      <InfoNote title="How this page works">
        <p>
          <span className="font-medium text-ink">A store is one place that holds stock</span>{" "}
          — the shop, a warehouse, a dealer&rsquo;s counter. Its address is the one
          Shiprocket already has as a pickup address: give the store the same
          name and press <span className="font-medium text-ink">Fetch</span>, and
          the address fills itself in, so what a courier collects from and what
          is written here cannot drift apart.
          {!isShiprocketConfigured() && (
            <> Shiprocket is not configured on this site at the moment, so addresses are typed in by hand.</>
          )}
        </p>
        <p>
          <span className="font-medium text-ink">Block</span> freezes a store
          without losing what it holds — nothing in it can be changed until it is
          unblocked. <span className="font-medium text-ink">Delete</span> removes
          the store and its stock list; the products themselves stay in the
          catalogue, and no order is affected.
        </p>
        <p>
          What a store holds is kept here for the shop&rsquo;s own use. It does not
          change what customers see on the site, and nothing here is shown to them.
        </p>
      </InfoNote>

      <div className="mt-6 space-y-3">
        {stores.length === 0 ? (
          <div className="border border-line bg-surface px-6 py-16 text-center">
            <p className="text-ink">{q ? `No store matches “${q}”.` : "No stores yet."}</p>
            <p className="mt-1 text-sm text-muted">
              {q ? (
                <Link href="/admin/inventory" className="text-accent hover:underline">
                  Show all stores
                </Link>
              ) : (
                "Add one, and give it the name its pickup address has at Shiprocket."
              )}
            </p>
          </div>
        ) : (
          stores.map((store) => (
            <article
              key={store.id}
              id={`store-${store.id}`}
              className={`scroll-mt-24 border bg-surface p-5 ${
                store.blockedAt ? "border-signal-500 bg-signal-50" : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-ink">
                      <Link href={`/admin/inventory/${store.slug}`} className="hover:text-accent">
                        {store.nickname}
                      </Link>
                    </h2>
                    {store.blockedAt && <Badge tone="warn">Blocked</Badge>}
                    {store.pickupId && <Badge>Shiprocket</Badge>}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-body">
                    {[store.line1, store.line2, store.city, store.state, store.postalCode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {(store.contactName || store.contactRole || store.phone) && (
                    <p className="mt-1 text-sm text-muted">
                      {/* Role first, then who it is (client, 2026-09-26):
                          scanning a list of stores, "warehouse manager" is
                          what you are looking for and the name is what you
                          then read. */}
                      {[
                        [store.contactRole, store.contactName].filter(Boolean).join(", "),
                        store.phone,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>

                {/* Right-aligned in a column of its own, so the figure sits
                    under its label and lines up down the list (client,
                    2026-09-26). */}
                <dl className="shrink-0 min-w-[4.5rem] text-right text-sm">
                  <dt className="label-tech text-muted">Products</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
                    {store.productCount ? store.productCount : "—"}
                  </dd>
                </dl>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
                <p className="text-muted">
                  {store.notes || (store.email ? store.email : "No notes")}
                </p>
                <StoreRowActions store={store} />
              </div>

              {flagged === store.id && error === "blocked" && (
                <p role="alert" className="mt-3 border-l-2 border-signal-500 bg-surface-subtle px-3 py-2 text-sm text-ink">
                  This store is blocked. Unblock it before changing what it holds.
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </Container>
  );
}
