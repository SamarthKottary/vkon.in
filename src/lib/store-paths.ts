import { revalidatePath } from "next/cache";

/**
 * Every page that shows a store's stock, refreshed together (client,
 * 2026-09-26: "the product stock which super admin changes should change in
 * inventory profile and stock section, similarly when in inventory stocks we
 * change it should change in super admin and everywhere else vice versa").
 *
 * There has only ever been **one number** — `store_products.qty`, written by
 * the admin's Edit and by the store's `+`/`−` alike. What went stale was the
 * router's own cache of the other pages: change a count in the admin, click
 * through to the store, and the browser could hand back the page it already
 * had. So a write to that column invalidates all four places it is read,
 * whichever of them did the writing.
 */
export function revalidateStore(slug: string): void {
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/profile`);
  revalidatePath(`/admin/inventory/${slug}`);
  revalidatePath("/admin/inventory");
}
