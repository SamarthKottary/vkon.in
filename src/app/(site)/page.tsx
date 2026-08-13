import { ContactStrip } from "@/components/home/ContactStrip";
import { Hero } from "@/components/home/Hero";
import { CategoryBrowser } from "@/components/home/CategoryBrowser";
import { RecentlyViewed } from "@/components/home/RecentlyViewed";
import { Section, SectionHeading } from "@/components/ui/Section";
import { categories } from "@/content/taxonomy";
import { site } from "@/content/site";
import { listProducts } from "@/lib/db/products";
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
  const all = await listProducts();

  /* Every category gets a card, including empty ones — they are marked "Coming
     soon" and cannot be opened. The range is part of what the section says, and
     the browser only lists names, so an empty card costs a line rather than a
     hole in a grid.

     Within a category, products flagged Featured in the admin come first. */
  const groups = categories.map((category) => ({
    category,
    items: all
      .filter((p) => p.category === category.key)
      .sort((a, b) => Number(b.featured) - Number(a.featured)),
  }));

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
          title="Panels for every pump on the farm"
          description="From a single-phase openwell set to a 40 HP fully automatic star-delta installation, with the mobile control and accessories that go alongside."
        />

        <div className="mt-12">
          <CategoryBrowser groups={groups} />
        </div>

      </Section>

      {/* Renders nothing until the visitor has actually opened a product — it
          reads their own browser, so the server has nothing to show. */}
      <RecentlyViewed products={all} />

      <ContactStrip />
    </>
  );
}
