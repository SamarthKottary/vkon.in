import { Suspense } from "react";
import { ContactStrip } from "@/components/home/ContactStrip";
import { PageHero } from "@/components/layout/PageHero";
import { ProductCatalogue } from "@/components/product/ProductCatalogue";
import { Container } from "@/components/ui/Container";
import { site } from "@/content/site";
import { listProducts } from "@/lib/db/products";
import { resolvePageMetadata } from "@/lib/db/pageSeo";

export async function generateMetadata() {
  return resolvePageMetadata({
    title: "Products",
    description: `The full ${site.name} range — three phase and single phase motor starters, star-delta panels, solar pump controllers, submersible cable, GSM mobile control, and home automation for commercial installations.`,
    path: "/products",
  });
}

/** Rendered per request so a newly saved product appears immediately. */
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await listProducts();

  return (
    <>
      {/* No breadcrumb here (client, 2026-08-23). "Home /" above a page
          reachable from the header's own Products link told a visitor nothing
          they did not have, and cost a line of vertical space at the top of
          the one page that should open on products.

          "Every panel we build" was the title until the same date and it
          undersold the range: cables, accessories, auto-start units and the
          home-automation lighting are not panels. */}
      {/* Pinned so the catalogue below rises over it as a curtain — the
          same treatment as the home hero and the about/contact mastheads
          (client: "the same moving up curtain on all products page, where
          it moves over everything we build section").

          Plain `top-0`, no negative-offset arithmetic: this masthead is
          `compact` and measures 201–227px across every width tested, so it
          never approaches even a short phone's viewport height the way the
          full-height hero does. `PageHero` itself is untouched — this is an
          external wrapper, same approach as the home page's `Hero`. */}
      <div className="sticky top-0 z-0">
        <PageHero
          compact
          eyebrow="Catalogue"
          title="Everything we build"
          description="Motor starters, industrial panels, solar, cables and home automation — filter by category, sub-category or motor rating."
        />
      </div>

      {/* The curtain sheet — opaque `bg-surface` over the pinned masthead,
          `z-10` above its `z-0`. */}
      <div data-curtain className="relative z-10 bg-surface">
        <div className="py-10 sm:py-12">
          <Container size="wide">
            {products.length === 0 ? (
              <EmptyCatalogue />
            ) : (
              /* useSearchParams needs a Suspense boundary to stay prerenderable. */
              <Suspense fallback={<CatalogueSkeleton />}>
                <ProductCatalogue products={products} />
              </Suspense>
            )}
          </Container>
        </div>

        <ContactStrip
          heading="Can't find the rating you need?"
          body="We build to order for non-standard HP ratings and supply conditions. Tell us the requirement and we will confirm what is possible."
        />
      </div>
    </>
  );
}

function EmptyCatalogue() {
  return (
    <div className="border border-line py-24 text-center">
      <p className="label-tech text-muted">Catalogue</p>
      <p className="mt-3 text-lg text-ink">No products published yet.</p>
      <p className="mt-2 text-sm text-muted">
        Products added in the admin appear here automatically.
      </p>
    </div>
  );
}

function CatalogueSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((key) => (
        <div key={key} className="h-96 animate-pulse border border-line bg-surface-subtle" />
      ))}
    </div>
  );
}
