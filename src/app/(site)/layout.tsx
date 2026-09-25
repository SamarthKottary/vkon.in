import { Footer } from "@/components/layout/Footer";
import { FooterSlot } from "@/components/layout/FooterSlot";
import { FloatingContact } from "@/components/layout/FloatingContact";
import { Header } from "@/components/layout/Header";
import { IntroSplash } from "@/components/layout/IntroSplash";
import { MobileActionBar } from "@/components/layout/MobileActionBar";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartSync } from "@/components/cart/CartSync";
import { GstProvider } from "@/components/pricing/GstProvider";
import { getGstRates } from "@/lib/db/settings";
import { JsonLd } from "@/components/ui/JsonLd";
import { categories, categoriesInSector, sectors, categoryLabel, sectorLabel, sectorOf } from "@/content/taxonomy";
import { protectionMeta } from "@/components/icons/protections";
import { listProducts } from "@/lib/db/products";
import { getCurrentCustomer } from "@/lib/account";
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
  /* Two independent reads, so the session lookup does not sit behind the
     catalogue query on every page in the group. `getCurrentCustomer` fails
     soft — an unreachable database renders the header signed-out rather than
     500-ing the whole site — so `Promise.all` is safe here. */
  const [products, customer, gstRates] = await Promise.all([
    listProducts(),
    getCurrentCustomer(),
    getGstRates(),
  ]);
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
    /* The tax rates reach every price on screen from here (2026-09-25): the
       cards, the cart and the checkout summary are all client components and
       cannot read a setting themselves. */
    <GstProvider rates={gstRates}>
      <IntroSplash />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:bg-action focus:px-5 focus:py-3 focus:text-sm focus:font-medium focus:text-action-ink"
      >
        Skip to content
      </a>

      <Header
        menu={menu}
        searchProducts={searchProducts}
        suggestionTerms={suggestionTerms}
        /* Only what the menu draws. The session, the id and everything else on
           the row stay on the server. */
        customer={
          customer
            ? { name: customer.name, email: customer.email, avatarUrl: customer.avatarUrl }
            : null
        }
      />
      {/* `bg-surface` is load-bearing, not decoration: it is what hides
          the footer behind this while the footer is pinned (see below).
          `body` carries the same colour, but a background set on `body`
          propagates to the canvas and leaves the element itself
          transparent, so it cannot do this job. */}
      {/* `overflow-x-clip` pays for the full-bleed tracks. `FeaturedProducts`
          and `RecentlyViewed` break out of the centred container with
          `mx-[calc(50%-50vw)]`, which makes them exactly `100vw` wide — and
          `vw` counts the vertical scrollbar, while the space they actually
          have does not. On a browser with a classic scrollbar that is ~15px of
          real page overflow and a horizontal scrollbar along the bottom of
          every page; measured in Chrome on 2026-09-16, `clientWidth` 1469
          against a `scrollWidth` of 1477. Headless Chromium hides it, because
          its overlay scrollbar has no width.

          **`clip`, never `hidden`.** `hidden` would make this a scroll
          container, and the curtain on every page — the sticky heroes,
          mastheads and the pinned footer — is positioned against the viewport.
          `clip` trims the few pixels of overshoot and creates no scrollport,
          so sticky is untouched. `overflow-y` stays visible, which the
          featured cards need to pop above their row. */}
      <main id="main" className="relative z-10 flex-1 overflow-x-clip bg-surface">
        {children}
        <FloatingContact />
        <MobileActionBar />
      </main>

      {/* The footer is revealed rather than scrolled to — the page above
          slides off it like a curtain opening (client: "Could we do a
          similar curtain opening scene for the bottom most section below
          the tell us what your running section", after the same treatment
          on the home hero).

          It is the mirror of the hero's, and the offset is on the mirror
          side: `bottom`, which is the sticky edge that *works* for a box
          whose natural position is the end of the document — a bottom
          offset only ever shifts a box up, to pull it into view from
          below, which is exactly what is wanted here and exactly why the
          hero could not use it.

          **The figure is the footer at its tallest, and again erring high
          is the safe direction.** The footer is 1267–1316px on a phone
          (five stacked blocks), 766px at `md`, 517–537px from `lg` up, so
          one number would either strand the top of the tall version
          off-screen or reduce the wide one to a 100px sliver of reveal.
          Too *low* a figure pins the footer with its own top edge above
          the viewport and it stays there — unreachable, since a pinned
          box does not scroll. Too high only weakens the effect: the
          footer pins lower and less of it shows early.

          `z-0`, with `relative z-10` on `main`: putting `z-10` on `main` keeps
          it above the footer (`z-0`) while scrolling so the curtain reveal
          effect is preserved, while allowing the footer links to receive
          mouse hover and pointer events properly when revealed. */}
      <FooterSlot>
        <div className="sticky bottom-[min(0px,calc(100svh_-_86rem))] z-0 md:bottom-[min(0px,calc(100svh_-_51rem))] lg:bottom-[min(0px,calc(100svh_-_37rem))]">
          <Footer />
        </div>
      </FooterSlot>
      <CartDrawer products={products} />
      <CartSync customerId={customer?.id ?? null} />

      <JsonLd data={organizationJsonLd()} />
    </GstProvider>
  );
}
