import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { isAuthenticated } from "@/lib/auth";
import { getProductById } from "@/lib/db/products";
import { ProductForm } from "../ProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/admin");

  const { id } = await params;
  const product = await getProductById(id);

  if (!product) notFound();

  return (
    <Container size="default">
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        All products
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">{product.name}</h1>
        {product.published && (
          <Link
            href={`/products/${product.slug}`}
            target="_blank"
            className="text-sm text-muted hover:text-ink"
          >
            View on site ↗
          </Link>
        )}
      </div>
      <p className="label-tech mt-1 text-muted">
        Updated {new Date(product.updatedAt).toLocaleString("en-IN")}
      </p>

      <div className="mt-8">
        <ProductForm product={product} />
      </div>
    </Container>
  );
}
