import { Footer } from "@/components/layout/Footer";
import { FloatingContact } from "@/components/layout/FloatingContact";
import { Header } from "@/components/layout/Header";
import { IntroSplash } from "@/components/layout/IntroSplash";
import { MobileActionBar } from "@/components/layout/MobileActionBar";
import { JsonLd } from "@/components/ui/JsonLd";
import { categories, categoriesInSector, sectors, categoryLabel, sectorLabel, sectorOf } from "@/content/taxonomy";
import { protectionMeta } from "@/components/icons/protections";
import { listProducts } from "@/lib/db/products";
import { organizationJsonLd } from "@/lib/seo";

/**
 * Per request, for the same reason the product routes are.
 *
 * The header's dropdown lists live products, so a cached layout would show a
 * stale menu after an admin adds or removes one — the exact staleness §3 of
 * ARCHITECTURE.md rejected ISR to avoid.
 */
export const dynamic = "force-dynamic";

/**
 * Chrome for the public site. `/admin` sits outside this group.
 *
 * The catalogue is read here rather than in the header so the header can stay
 * a client component: the products dropdown needs the live list, and a client
 * component cannot query the database itself. One query serves every page in
 * the group.
 */
export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const products = await listProducts();
  /* One column per market, listing its categories with a product count each.
     The counts are computed here rather than in the menu so the client
     component is handed numbers instead of the whole catalogue — it does not
     name products any more, so shipping them to the browser would be paying
     for data nothing renders. */
  const menu = sectors.map((sector) => ({
    key: sector.key,
    label: sector.label,
    categories: categoriesInSector(sector.key).map((category) => ({
      key: category.key,
      label: category.label,
      count: products.filter((p) => p.category === category.key).length,
    })),
  }));

  /* `HeaderSearch`'s own index — reuses this same query rather than a
     second one, and ships only what that panel actually renders (name,
     category, one image URL), the same restraint `menu` above already
     applies to its own shape. Includes precomputed searchContent. */
  const searchProducts = products.map((p) => {
    const protectionLabels = p.protections
      .map((key) => {
        const meta = protectionMeta[key];
        return meta ? `${meta.label} ${key}` : key;
      })
      .join(" ");

    const specText = p.spec.map((s) => `${s.label} ${s.value}`).join(" ");

    const searchContent = [
      p.name,
      p.tagline,
      categoryLabel(p.category),
      sectorLabel(sectorOf(p.category) ?? ""),
      p.description,
      p.features.join(" "),
      protectionLabels,
      p.hpRanges.join(" "),
      specText,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      image: p.images[0]?.url ?? null,
      searchContent,
    };
  });

  /* Short, recognisable terms the search bars offer as autocomplete
     suggestions — sector names, category names, product names, protection
     labels and HP ranges. Deduplicated and sorted once on the server so the
     client receives a ready-to-filter list. */
  const suggestionTerms = (() => {
    const terms = new Set<string>();
    for (const s of sectors) terms.add(s.label);
    for (const c of categories) terms.add(c.label);
    for (const p of products) {
      terms.add(p.name);
      for (const r of p.hpRanges) terms.add(r);
      for (const key of p.protections) {
        const meta = protectionMeta[key];
        if (meta) terms.add(meta.label);
      }
    }
    return Array.from(terms).sort();
  })();

  return (
    <>
      <IntroSplash />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:bg-action focus:px-5 focus:py-3 focus:text-sm focus:font-medium focus:text-action-ink"
      >
        Skip to content
      </a>

      <Header menu={menu} searchProducts={searchProducts} suggestionTerms={suggestionTerms} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <FloatingContact />
      <MobileActionBar />

      <JsonLd data={organizationJsonLd()} />
    </>
  );
}
