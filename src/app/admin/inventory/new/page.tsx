import { Container } from "@/components/ui/Container";
import { Crumbs } from "../Crumbs";
import { requireInventoryPage } from "@/lib/auth";
import { listProducts } from "@/lib/db/products";
import { getGstRates } from "@/lib/db/settings";
import { StoreForm } from "../StoreForm";

export const dynamic = "force-dynamic";

/**
 * A new store: the address, then the products it holds (client, 2026-09-26).
 *
 * Unpublished products are offered too — a store can hold something that is not
 * on sale today, and an inventory that can only describe the catalogue is not
 * an inventory.
 */
export default async function NewStorePage() {
  await requireInventoryPage();
  const [products, rates] = await Promise.all([
    listProducts({ includeUnpublished: true }),
    getGstRates(),
  ]);

  return (
    <Container size="wide">
      <Crumbs trail={[{ label: "Inventory", href: "/admin/inventory" }, { label: "New store" }]} />

      <h1 className="text-2xl">Add a store</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Name it, fetch its address from Shiprocket, then choose what it holds.
      </p>

      <div className="mt-6 max-w-4xl">
        <StoreForm
          rates={rates}
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
      </div>
    </Container>
  );
}
