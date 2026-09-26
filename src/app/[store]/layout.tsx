import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug } from "@/lib/db/stores";
import { currentStore } from "@/lib/store-auth";
import { StoreShell } from "./StoreShell";

export const metadata: Metadata = {
  title: "Stock",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * A store's own console at `vkon.in/<slug>` (client, 2026-09-26: "in inventory
 * page it should be like this, vkon.in/storename").
 *
 * **A root-level dynamic segment**, which means every address the site does not
 * otherwise have lands here. Static routes win in Next's router, so `/products`
 * and `/cart` are untouched; anything else asks the database for a store of
 * that name and renders the site's 404 when there is none. That is the price of
 * the address the client asked for, and it is paid once, here.
 *
 * Nothing of the shop is around it — no header, no cart, no footer. This is a
 * tool for somebody standing at a shelf, not a page of the site.
 */
export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ store: string }>;
}) {
  const { store: slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const signedIn = await currentStore();
  const inside = signedIn?.slug === store.slug && !store.blockedAt;

  return (
    <StoreShell slug={store.slug} name={store.nickname} signedIn={inside}>
      {children}
    </StoreShell>
  );
}
