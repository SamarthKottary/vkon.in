import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { isAuthenticated } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listProducts } from "@/lib/db/products";
import { ProductReorder } from "./ProductReorder";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/admin");

  const { saved, deleted } = await searchParams;
  const products = await listProducts({ includeUnpublished: true });

  return (
    <Container size="wide">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl">Products</h1>
          <p className="mt-1 text-sm text-muted">
            {products.length} product{products.length === 1 ? "" : "s"} · changes
            go live immediately
          </p>
        </div>

        <Link
          href="/admin/products/new"
          className="inline-flex h-10 items-center gap-2 rounded-sm bg-action px-4 text-sm font-medium text-action-ink hover:bg-action-hover"
        >
          <PlusIcon className="h-4 w-4" />
          New product
        </Link>
      </div>

      {!isDatabaseConfigured() && (
        <div className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm">
          <p className="font-medium text-ink">No database configured</p>
          <p className="mt-1 text-body">
            Set <code className="font-mono text-[0.8125rem]">DATABASE_URL</code> in{" "}
            <code className="font-mono text-[0.8125rem]">.env.local</code> and run{" "}
            <code className="font-mono text-[0.8125rem]">npm run db:setup</code>.
          </p>
        </div>
      )}

      {(saved || deleted) && (
        <p
          role="status"
          className="mt-6 border-l-2 border-accent bg-surface px-4 py-3 text-sm text-ink"
        >
          {saved ? "Product saved and published." : "Product deleted."}
        </p>
      )}

      <div className="mt-8 border border-line bg-surface">
        {products.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-ink">No products yet.</p>
            <p className="mt-1 text-sm text-muted">
              Add your first product to see it on the site.
            </p>
          </div>
        ) : (
          <>
            <p className="border-b border-line px-4 py-2 text-sm text-muted">
              Drag a row (or use its up/down arrows) to set the order the
              catalogue lists these in.
            </p>
            <ProductReorder products={products} />
          </>
        )}
      </div>
    </Container>
  );
}
