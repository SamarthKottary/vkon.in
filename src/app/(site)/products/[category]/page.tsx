import { notFound, permanentRedirect, redirect } from "next/navigation";
import { isCategory } from "@/content/taxonomy";
import { getProductBySlug } from "@/lib/db/products";
import { productHref } from "@/lib/product-url";

/**
 * The one-segment address under `/products/…`, which is now two things at
 * once and answers both with a redirect rather than a page.
 *
 * **Every product URL the site ever printed** was `/products/<slug>` — in
 * search results, in shared WhatsApp messages, in order emails and in
 * customers' bookmarks. Since 2026-09-26 a product lives at
 * `/products/<category>/<slug>` (the client: "in url it shows
 * /products/demo-industrial-dol — also include category"), so this segment
 * looks for a product of that name and sends it on, permanently, to where it
 * lives now. Nothing that was ever published breaks.
 *
 * **A category key is a reasonable guess** once the new addresses are in the
 * wild — `/products/industrial-panel` is what half of `/products/industrial-
 * panel/demo-industrial-dol` looks like — so it answers with the catalogue
 * filtered to that category. A temporary redirect, not a permanent one: the
 * filtered catalogue is a query on `/products`, and pinning this spelling to
 * it forever is a promise there is no reason to make.
 *
 * A product wins a collision with a category of the same name, because that
 * address already meant the product and links to it exist.
 */
export const dynamic = "force-dynamic";

export default async function LegacyProductPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;

  const product = await getProductBySlug(category);
  if (product) permanentRedirect(productHref(product));

  if (isCategory(category)) redirect(`/products?category=${category}`);

  notFound();
}
