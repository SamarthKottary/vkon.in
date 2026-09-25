import { listPageSeo } from "@/lib/db/pageSeo";
import { Container } from "@/components/ui/Container";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { requireAdminPage } from "@/lib/auth";
import { SeoForm } from "./SeoForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SEO — Admin",
};

export default async function SeoPage() {
  const admin = await requireAdminPage();

  // SEO is Super User only.
  if (admin.role !== "super") {
    return (
      <Container size="narrow">
        <AccessDenied
          page="Static SEO"
          role={admin.role}
          requiredRoles={["super"]}
        />
      </Container>
    );
  }

  const initial = await listPageSeo();

  return (
    <Container size="narrow">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Static SEO
        </h1>
        <p className="mt-2 text-sm text-muted">
          Meta titles and descriptions for the main pages. Leave a field blank to
          fall back to the default metadata. Product SEO is edited on each
          product&apos;s own form.
        </p>
      </div>

      <SeoForm initial={initial} />
    </Container>
  );
}
