import type { Product } from "@/lib/types";

/**
 * Where a product lives (client, 2026-09-26: "in url it shows
 * /products/demo-industrial-dol — also include category").
 *
 * The canonical address is `/products/<category>/<slug>`, which is the
 * breadcrumb written out: Home / Products / Industrial Panels / this panel.
 * The category key is already a URL segment (`industrial-panel`), so nothing
 * new has to be stored or kept in step — a product moved to another category
 * moves with it, and the old address redirects to the new one.
 *
 * **Without a category it returns the one-segment path**, which is not a dead
 * link: `/products/[category]/page.tsx` recognises a product slug there and
 * permanently redirects to the canonical address. That is what every link
 * printed, mailed or shared before today looks like, and it is what a cart
 * line or an order item can build, since those store a slug and no more.
 */
export function productHref(product: { slug: string; category?: string | null }): string {
  return product.category
    ? `/products/${product.category}/${product.slug}`
    : `/products/${product.slug}`;
}

/** The same address, absolute — for metadata, structured data and sharing. */
export function productUrl(base: string, product: Pick<Product, "slug" | "category">): string {
  return `${base}${productHref(product)}`;
}
