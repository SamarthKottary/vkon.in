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
import { resolvePageMetadata } from "@/lib/db/pageSeo";

export async function generateMetadata() {
  return resolvePageMetadata({
    title: `${site.legalName} — Motor Starters, Industrial Panels & Home Automation`,
    description: site.description,
    path: "/",
    absoluteTitle: true,
  });
}

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
      {/* The hero pins itself and everything below rises over it as one
          sheet (client: "The what we make section should move up like a
          curtain over the slide show and ranges at the bottom").

          **A negative `top`, not `top-0`, and not `bottom-0`.** Below
          `lg` the hero is still taller than the viewport at every size we
          build for — 984px against 664 on an iPhone 13 — so `top-0` would
          pin its *top* edge and leave the figures along its bottom, the
          "1–40 HP" strip the client means by "ranges at the bottom",
          unreachable for the whole of the page rather than merely
          covered. `bottom-0` is what that behaviour is called, but it
          does not do it here: a bottom sticky offset only ever shifts a
          box *up*, to pull it into view from below, and this box starts
          at the top of the document — measured directly, it produced no
          offset at all.

          A negative top is the same idea expressed the way sticky
          actually works: hold the box `<height> − viewport` above the top
          edge, which is exactly "scroll normally until the bottom of the
          hero reaches the bottom of the screen, then hold". `min(0px, …)`
          keeps it at plain `top-0` on a viewport tall enough not to need
          it — which, from `lg` up (below), is most of them.

          **Each figure is that tier's content *floor*, not "the hero's
          height" — the hero no longer has one.** Since 2026-09-03 `Hero`
          carries `min-h: 100svh − <fixed chrome>`, so its height is
          `max(content, one screenful)`: on every desktop the screenful
          wins and the hero is exactly as tall as the window, on every
          phone the content wins because the headline wraps to four or
          five lines. These three numbers describe only the second case —
          the tallest the *content* alone gets in that tier, measured
          against a viewport too short for `min-h` to bind: 984px at 320
          wide, 926 at 360, 883 at 390, 853 at 640, 817 at 768, 803 to
          1023, and a flat 586 from `lg` up.

          That split is what makes the formula correct in both cases
          without knowing which one it is in. Where the screenful wins,
          `100svh − <floor>` is positive, `min()` collapses it to plain
          `top-0`, and a hero that is exactly `100svh − 65px` tall pins
          with all of itself on screen and the curtain showing in the 65px
          the header vacated. Where the content wins, the floor is the
          real height and the negative offset does its original job.

          **Erring high is still the safe direction.** Too *low* strands
          the figures below the fold permanently, since pinning is exactly
          what stops them scrolling clear again — measured 105px of them
          lost at 320 wide before the mobile figure was raised. Too high
          only costs a sooner-than-necessary pin, with the curtain — never
          the page background — filling the gap, since the curtain's top
          edge and the hero's bottom edge are the same point in the flow.
          Re-measure every tier if `Hero`'s or `HeroRotator`'s padding or
          type scale changes; measure at a viewport short enough that
          `min-h` cannot bind, or you will measure the window instead of
          the content.

          `svh`, not `vh` or `dvh`: `vh` is the *largest* viewport on a
          phone, so with the browser chrome showing it would push the
          figures under it; `dvh` changes while the chrome collapses,
          which would slide the pinned hero mid-scroll. `svh` is the one
          that cannot clip.

          The extra `3.5rem` below `md` is `layout/MobileActionBar`, which
          is `fixed bottom-0` and 57px tall on a phone. Without it the
          hero pins with its second row of figures permanently behind that
          bar — normally they would scroll clear of it, and pinning is
          exactly what takes that away. `md:` drops that allowance, since
          the bar is `md:hidden`.

          Sticky, not fixed: a sticky box keeps its space in the flow, so
          the section below still starts one hero-height down the document
          and the page's own scroll length is unchanged. Nothing here
          measures anything or listens to scroll — the effect is three
          classes, and on a browser that does not understand `svh` the
          offset is simply dropped and the page stacks normally. */}
      <div className="sticky top-[min(0px,calc(100svh_-_3.5rem_-_63rem))] z-0 md:top-[min(0px,calc(100svh_-_52rem))] lg:top-[min(0px,calc(100svh_-_38rem))]">
        <Hero />
      </div>

      {/* The curtain. One opaque sheet over the hero rather than a
          per-section treatment: every section below already paints its
          own background, and `bg-surface` here is the guarantee that
          whatever the leading edge happens to be — the "What we make"
          heading today — the hero never shows through it. `z-10` puts the
          whole sheet above the pinned hero's `z-0`; the site header is
          `z-50` and stays above both. */}
      <div data-curtain className="relative z-10 bg-surface">
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

        {/* Renders nothing when there are no featured products. The heading
            and paging arrows are `FeaturedProducts`' own, not this page's —
            same as `RecentlyViewed` below it, so the two are a matched pair. */}
        {featured.length > 0 && (
          <Section size="wide">
            <FeaturedProducts products={featured} />
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
      </div>
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
