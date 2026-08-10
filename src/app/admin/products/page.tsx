import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PencilIcon, PlusIcon } from "@/components/icons/ui";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { categoryLabel } from "@/content/taxonomy";
import { isAuthenticated } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listProducts } from "@/lib/db/products";
import { DeleteProductButton } from "./DeleteProductButton";

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
          <ul>
            {products.map((product) => (
              <li
                key={product.id}
                className="flex flex-wrap items-center gap-4 border-b border-line p-4 last:border-b-0 sm:flex-nowrap"
              >
                <div className="relative h-14 w-14 shrink-0 border border-line bg-surface-subtle">
                  {product.images[0] ? (
                    <Image
                      src={product.images[0].url}
                      alt=""
                      fill
                      sizes="3.5rem"
                      className="object-contain p-1"
                    />
                  ) : (
                    <span className="label-tech flex h-full w-full items-center justify-center text-muted">
                      —
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="truncate font-medium text-ink hover:text-accent"
                    >
                      {product.name}
                    </Link>
                    {!product.published && <Badge tone="warn">Draft</Badge>}
                    {product.featured && <Badge tone="brand">Featured</Badge>}
                  </div>
                  <p className="label-tech mt-1.5 truncate text-muted">
                    {categoryLabel(product.category)} · /{product.slug}
                    {product.videoUrl ? " · video" : ""}
                    {product.images.length
                      ? ` · ${product.images.length} image${product.images.length === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {product.published && (
                    <Link
                      href={`/products/${product.slug}`}
                      target="_blank"
                      className="px-3 py-2 text-sm text-muted hover:text-ink"
                    >
                      View
                    </Link>
                  )}
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="inline-flex items-center gap-1.5 border border-line-strong px-3 py-2 text-sm text-ink hover:border-ink"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                    Edit
                  </Link>
                  <DeleteProductButton id={product.id} name={product.name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
