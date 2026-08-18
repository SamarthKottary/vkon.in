import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { FloatingContact } from "@/components/layout/FloatingContact";
import { MobileActionBar } from "@/components/layout/MobileActionBar";
import { JsonLd } from "@/components/ui/JsonLd";
import { categoriesInSector, sectors } from "@/content/taxonomy";
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

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:bg-action focus:px-5 focus:py-3 focus:text-sm focus:font-medium focus:text-action-ink"
      >
        Skip to content
      </a>

      <Header menu={menu} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <MobileActionBar />
      <FloatingContact />

      <JsonLd data={organizationJsonLd()} />
    </>
  );
}
