import Link from "next/link";
import { PlusIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { requireAdminPage } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listProducts } from "@/lib/db/products";
import { ProductReorder } from "./ProductReorder";
import { ListSearch } from "@/components/admin/ListControls";
import { categoryLabel } from "@/content/taxonomy";
import { readListQuery } from "@/lib/admin-list";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; q?: string }>;
}) {
  const admin = await requireAdminPage();

  const params = await searchParams;
  const { saved, deleted } = params;
  const { q } = readListQuery(params);
  const products = await listProducts({ includeUnpublished: true });
  /* Searched here rather than in SQL: the whole catalogue is loaded anyway
     for the reorder list, and it is tens of rows (client, 2026-09-19). Name,
     slug, tagline or category, any case. */
  const needle = q.toLowerCase();
  const shown = needle
    ? products.filter((p) =>
        [p.name, p.slug, p.tagline, categoryLabel(p.category)].some((field) =>
          field.toLowerCase().includes(needle),
        ),
      )
    : products;

  return (
    <Container size="wide">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl">Products</h1>
          <p className="mt-1 text-sm text-muted">
            {q
              ? `${shown.length} of ${products.length} match “${q}”`
              : `${products.length} product${products.length === 1 ? "" : "s"}`}{" "}
            · changes go live immediately
          </p>
        </div>

        <ListSearch
          path="/admin/products"
          q={q}
          placeholder="Name, slug or category"
          label="Search products"
        />

        {/* Centred below `sm` (client, 2026-09-23), where it is the only
            thing on its line and sat oddly against the left gutter; from
            `sm` up the header is a row and it keeps its place in it. */}
        <Link
          href="/admin/products/new"
          className="mx-auto inline-flex h-10 items-center gap-2 rounded-sm bg-action px-4 text-sm font-medium text-action-ink hover:bg-action-hover sm:mx-0"
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
        ) : shown.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-ink">No products match “{q}”.</p>
          </div>
        ) : (
          <>
            <div className="border-b border-line px-4 py-2 text-xs font-medium text-muted">
              {q ? "Search results" : "Drag to reorder on the site"}
            </div>
            {/* Keyed on the search, so the list's own order state starts
                again from the rows shown. */}
            <ProductReorder key={q} products={shown} reorderable={!q} role={admin.role} />
          </>
        )}
      </div>
    </Container>
  );
}
