import Link from "next/link";
import { ContactStrip } from "@/components/home/ContactStrip";
import { Hero } from "@/components/home/Hero";
import { ProtectionIcon, protectionMeta } from "@/components/icons/protections";
import { ArrowRightIcon } from "@/components/icons/ui";
import { ProductCard } from "@/components/product/ProductCard";
import { Container } from "@/components/ui/Container";
import { Section, SectionHeading } from "@/components/ui/Section";
import { categories } from "@/content/taxonomy";
import { site } from "@/content/site";
import { listFeaturedProducts, listProducts } from "@/lib/db/products";
import { pageMetadata } from "@/lib/seo";
import type { ProtectionKey } from "@/lib/types";

export const metadata = pageMetadata({
  title: `${site.name} — Motor Starters & Control Panels for Agriculture`,
  description: site.description,
  path: "/",
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

const HEADLINE_PROTECTIONS: ProtectionKey[] = [
  "dry-run",
  "hv-lv",
  "single-phase",
  "phase-reversal",
  "overload-relay",
  "rotary-lock",
];

export default async function HomePage() {
  const [featured, all] = await Promise.all([
    listFeaturedProducts(3),
    listProducts(),
  ]);

  // Fall back to the newest products so the home page is never empty just
  // because nothing has been flagged as featured yet.
  const shown = featured.length > 0 ? featured : all.slice(0, 3);

  const counts = new Map<string, number>();
  for (const product of all) {
    counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
  }

  return (
    <>
      <Hero />

      <Section size="wide" bordered={false}>
        <SectionHeading
          eyebrow="What we make"
          title="Panels for every pump on the farm"
          description="From a single-phase openwell set to a 100 HP star-delta installation, with the cable and mobile control that go alongside."
        />

        {/* A ruled directory rather than a card grid: it stays square with any
            number of categories, where a 3-column grid leaves visible empty
            cells whenever the count is not a multiple of three. */}
        <ul className="mt-10 border-t border-line">
          {categories.map((category) => {
            const count = counts.get(category.key) ?? 0;
            return (
              <li key={category.key} className="border-b border-line">
                <Link
                  href={`/products?category=${category.key}`}
                  className="group grid gap-x-8 gap-y-2 py-6 transition-colors hover:bg-surface-subtle sm:grid-cols-[minmax(0,15rem)_1fr_auto] sm:items-baseline"
                >
                  <h3 className="text-lg leading-snug">{category.label}</h3>
                  <p className="max-w-xl text-sm leading-relaxed text-muted">
                    {category.description}
                  </p>
                  <span className="label-tech flex items-center gap-3 text-muted sm:justify-end">
                    {count > 0
                      ? `${count} product${count === 1 ? "" : "s"}`
                      : "Coming soon"}
                    <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:text-accent" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <section className="bg-band py-16 sm:py-20 lg:py-24">
        <Container size="wide">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,24rem)_1fr] lg:gap-20">
            <SectionHeading
              tone="dark"
              eyebrow="Protection delivered"
              title="What takes a motor out"
              description="Rural supply is not kind to pumps. These are the conditions a Vkon panel watches for, continuously, on all three phases."
            />

            <ul className="grid border-t border-band-line sm:grid-cols-2">
              {HEADLINE_PROTECTIONS.map((key) => (
                <li
                  key={key}
                  className="flex gap-4 border-b border-band-line py-5 sm:odd:pr-8 sm:even:border-l sm:even:pl-8"
                >
                  <ProtectionIcon
                    name={key}
                    className="mt-0.5 h-5 w-5 shrink-0 text-band-accent"
                  />
                  <div>
                    <h3 className="text-[0.9375rem] font-medium text-band-ink">
                      {protectionMeta[key].label}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-band-muted">
                      {protectionMeta[key].description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      {shown.length > 0 && (
        <Section size="wide" bordered={false}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading eyebrow="Catalogue" title="Selected products" />
            <Link href="/products" className="link-cta">
              All products
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index === 0} />
            ))}
          </div>
        </Section>
      )}

      <ContactStrip />
    </>
  );
}
