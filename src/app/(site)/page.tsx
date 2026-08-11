import Link from "next/link";
import { ContactStrip } from "@/components/home/ContactStrip";
import { Hero } from "@/components/home/Hero";
import { ArrowRightIcon } from "@/components/icons/ui";
import { CategoryRow } from "@/components/product/CategoryRow";
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

  /* One row per category: an intro panel, then that category's products running
     off to the right. Categories with nothing in them are omitted rather than
     rendered as a lone intro card with no products beside it — the same reason
     the old category grid became a list. They still appear as filters on
     /products.

     Within a row, products flagged Featured in the admin come first; that flag
     is what the ordering is for now that the home page shows the whole range
     instead of a hand-picked three. */
  const groups = categories
    .map((category) => ({
      category,
      items: all
        .filter((p) => p.category === category.key)
        .sort((a, b) => Number(b.featured) - Number(a.featured)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <Hero />

      <Section size="wide" bordered={false}>
        <SectionHeading
          eyebrow="What we make"
          title="Panels for every pump on the farm"
          description="From a single-phase openwell set to a 40 HP fully automatic star-delta installation, with the mobile control and accessories that go alongside."
        />

        {groups.length > 0 ? (
          <div className="mt-12 flex flex-col gap-14">
            {groups.map((group, index) => (
              <CategoryRow
                key={group.category.key}
                category={group.category}
                products={group.items}
                lead="banner"
                headingLevel="h3"
                priority={index === 0}
              />
            ))}
          </div>
        ) : (
          <p className="mt-10 border-t border-line pt-6 text-muted">
            The catalogue is being photographed. Call us for the full range.
          </p>
        )}

        <Link href="/products" className="link-cta mt-14">
          All products
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </Section>

      <ContactStrip />
    </>
  );
}
