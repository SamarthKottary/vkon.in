import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { isAuthenticated } from "@/lib/auth";
import { ProductForm } from "../ProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  if (!(await isAuthenticated())) redirect("/admin");

  return (
    <Container size="default">
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        All products
      </Link>

      <h1 className="mt-4 text-2xl">New product</h1>
      <p className="mt-1 text-sm text-muted">
        It appears on the site as soon as you save, unless you leave it as a draft.
      </p>

      <div className="mt-8">
        <ProductForm />
      </div>
    </Container>
  );
}
