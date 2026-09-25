import type { Product } from "@/lib/types";

/**
 * A product's stock code — `VKDEMOWARDRO`.
 *
 * **Derived from the slug, not stored**: the slug is already the one
 * human-readable identifier a product has, it is unique by definition, and a
 * second column would be a second thing to keep in step with it. The customer
 * quotes this on the phone and it is printed on the invoice, so it is upper
 * case, letters and digits only, and short enough to read out.
 *
 * `VK` for Vkon (client, 2026-09-25). The cart carried `ST` — the prefix of
 * the reference site the layout was copied from — in three places, which is
 * how a placeholder gets shipped; it is one function now.
 */
export function productSku(product: Pick<Product, "slug">): string {
  const body = product.slug.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10);
  return `VK${body}`;
}
