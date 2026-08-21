import { ContactStrip } from "@/components/home/ContactStrip";
import { FeaturedProducts } from "@/components/home/FeaturedProducts";
import { Hero } from "@/components/home/Hero";
import { SectorBrowser } from "@/components/home/SectorBrowser";
import { SubscribePanel } from "@/components/layout/SubscribePanel";
import { RecentlyViewed } from "@/components/home/RecentlyViewed";
import { Section, SectionHeading } from "@/components/ui/Section";
import { categoriesInSector, sectors } from "@/content/taxonomy";
import { site } from "@/content/site";
import { listFeaturedProducts, listProducts } from "@/lib/db/products";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: `${site.name} — Motor Starters & Control Panels for Agriculture`,
  description: site.description,
  path: "/",
  absoluteTitle: true,
});

/**
 * Rendered per request.
 *
 * ISR was tried first and rejected: `revalidatePath` marks a cached page stale
 * but Next still serves the stale copy to the next request while regenerating,
 * so an admin who saved a product and immediately opened the site saw the old
 * version. Reading Postgres on each request costs a single indexed query over a
 * pooled connection — invisible next to mobile network latency, and it removes
 * a whole category of "I saved it but it isn't showing".
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [all, featured] = await Promise.all([
    listProducts(),
    listFeaturedProducts(8),
  ]);

  /* Every sector gets a card, including ones with nothing under them yet —
     those are marked "Coming soon" and cannot be opened. The range is part of
     what the section says, and the browser only lists names, so an empty card
     costs a line rather than a hole in a grid.

     Counting happens here rather than in the browser so the component stays a
     view over data it is handed. It is a client component; giving it the whole
     product list to count would ship every product's description to the
     browser to render five numbers. */
  const groups = sectors.map((sector) => {
    const inSector = categoriesInSector(sector.key);
    return {
      sector,
      categories: inSector.map((category) => ({
        category,
        count: all.filter((p) => p.category === category.key).length,
      })),
      total: all.filter((p) => sectorContains(inSector, p.category)).length,
    };
  });

  return (
    <>
      <Hero />

      {/* Tight bottom padding: the reserved dropdown area below the cards
          already supplies the breathing room, so the section's usual pb-16/24
          stacked on top of it read as a dead band before the contact strip. */}
      <Section size="wide" bordered={false} /* The `lg:pb-8` is not redundant. Section's own padding is
             `py-16 sm:py-20 lg:py-24`, and a bare `sm:pb-8` loses at large
             widths because the lg media query is emitted after the sm one —
             media order beats property specificity. */
          className="pb-6 sm:pb-8 lg:pb-8">
        <SectionHeading
          align="center"
          eyebrow="What we make"
          title="Three categories, the same build"
          description="Agriculture is the range shipping today — starters, solar, auto start units, cable and accessories. Industrial and commercial are where the same panel discipline goes next. Open a card for the sub-categories under each."
        />

        <div className="mt-12">
          <SectorBrowser groups={groups} />
        </div>

      </Section>

      {/* Renders nothing when there are no featured products — the section
          heading has nothing to sit above otherwise. */}
      {featured.length > 0 && (
        <Section size="wide">
          {/* Left-aligned, same as `RecentlyViewed`'s heading below it —
              not the centred `SectionHeading` used elsewhere on this page. */}
          <div>
            <h2 className="text-xl leading-snug sm:text-2xl">Featured products</h2>
            <p className="mt-2 text-sm text-muted">
              A handful pulled out from the catalogue.
            </p>
          </div>

          <div className="mt-12">
            <FeaturedProducts products={featured} />
          </div>
        </Section>
      )}

      {/* Renders nothing until the visitor has actually opened a product — it
          reads their own browser, so the server has nothing to show. */}
      <RecentlyViewed products={all} />

      {/* Placed per page rather than from inside `ContactStrip`, which used to
          put it on all five pages that close with one. Home, about and contact
          carry it; the catalogue and product pages do not, because somebody
          comparing panels is mid-task. */}
      <SubscribePanel />

      <ContactStrip />
    </>
  );
}

/** Whether a product's category is one of this sector's. */
function sectorContains(
  inSector: { key: string }[],
  category: string,
): boolean {
  return inSector.some((c) => c.key === category);
}
