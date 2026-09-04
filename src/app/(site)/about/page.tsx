import Image from "next/image";
import { AboutGallery, type GalleryImage } from "@/components/about/AboutGallery";
import {
  SocialProfileCard,
  type SocialProfile,
} from "@/components/about/SocialProfileCard";
import { StatCounter } from "@/components/about/StatCounter";
import { TiltCard } from "@/components/about/TiltCard";
import {
  ArrowRightIcon,
  DownloadIcon,
  FacebookIcon,
  FactoryIcon,
  HomeIcon,
  InstagramIcon,
  LinkedInIcon,
  SproutIcon,
  XIcon,
  YouTubeIcon,
} from "@/components/icons/ui";
import { SubscribePanel } from "@/components/layout/SubscribePanel";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { JsonLd } from "@/components/ui/JsonLd";
import { site } from "@/content/site";
import { breadcrumbJsonLd } from "@/lib/seo";
import { resolvePageMetadata } from "@/lib/db/pageSeo";

export async function generateMetadata() {
  return resolvePageMetadata({
    title: "About Us",
    description: `${site.legalName} builds smart automation and IoT technology for homes, farms and industry — more reliable, efficient, safe and sustainable.`,
    path: "/about",
  });
}

/**
 * About Us.
 *
 * **The copy on this page is the client's own, supplied 2026-08-20**, and it
 * replaced placeholder copy that had been written to describe the trade rather
 * than the company. Treat it as content, not as prose to improve: rewording it
 * to fit a layout is the wrong way round, and the previous text existed only
 * because there was nothing real to put here yet.
 *
 * Structure mirrors `/contact`: a photographic masthead carrying the heading
 * and one line, the breadcrumb below it rather than over the picture, then
 * ordinary surface sections. The two-column section idiom — a `label-tech`
 * heading in a narrow left rail against the copy — is the same one the product
 * detail page uses for Description and Features.
 *
 * The three markets are 3D tilt cards (`TiltCard`) and the vision/culture/goals
 * headings carry theme icons — the one place on the site that leans decorative,
 * kept within the design language: 2px corners, accent used only on the marks,
 * copy still left-aligned. See ARCHITECTURE.md's change log.
 */

/** "In daily living:" etc. The lead-in is part of the sentence, not a label. */
const TRANSITION = [
  {
    lead: "Daily living",
    icon: HomeIcon,
    body: "Smart lighting and climate control — convenience, safety and lower bills.",
  },
  {
    lead: "Agriculture",
    icon: SproutIcon,
    body: "Automation that saves water and nutrients, cuts costs and lifts yield.",
  },
  {
    lead: "Industry",
    icon: FactoryIcon,
    body: "Predictive sensors that watch conditions in real time for safety and compliance.",
  },
];

/** Placed in `public/` rather than served from the database: it is one file
 *  the whole site shares, and a static path can be linked from anywhere
 *  without a query. Replace the file, keep the name, and nothing here or in
 *  the admin needs to change. */
const BROCHURE = "/vkon-automation-brochure.pdf";

/** Client-supplied figures (2026-08-24). `value` is the number the counter
 *  animates to; `suffix` is printed as-is beside it, so "k" and "+" stay out
 *  of the arithmetic. */
const STATS = [
  { value: 35, suffix: "+", label: "Years of experience" },
  { value: 50, suffix: "k", label: "Customers" },
  { value: 25, suffix: "", label: "Products" },
];

/**
 * Photographs for the strip in §03.
 *
 * **These are placeholders, and they are the site's own segment photography
 * rather than stock pulled off the web.** Anything downloaded from an image
 * search arrives with an unknown licence, and a commercial site is exactly
 * where that bill comes due; these are already licensed for this project,
 * already sized, and already on brand. Swap them for real factory and
 * installation photographs when there are some — only this array changes.
 */
const GALLERY: GalleryImage[] = [
  { src: "/segments/industrial.jpg", alt: "Industrial plant floor" },
  { src: "/segments/agriculture.jpg", alt: "Irrigated farmland" },
  { src: "/segments/solar.jpg", alt: "Solar array in open ground" },
  { src: "/segments/home-automation.jpg", alt: "A smart-home interior" },
  { src: "/segments/commercial.jpg", alt: "A commercial building" },
  { src: "/aboutus-background.jpg", alt: "Open country at dawn" },
];

/**
 * Display order for §04, and the per-platform detail `site.socials` does not
 * carry.
 *
 * The order is the client's (2026-08-24) and is load-bearing, not incidental:
 * a two-column row-flow grid fills left-then-right, so this sequence is what
 * puts Instagram above X on the left and Facebook above YouTube on the right,
 * with LinkedIn last and centred. Reordering the array rearranges the page.
 *
 * `color` is the brand colour on a *light* surface, which is why X is black
 * here and off-white in `Footer` — see the note there.
 */
const PROFILE_ORDER = ["instagram", "facebook", "x", "youtube", "linkedin"];

const PROFILE_DETAIL: Record<
  string,
  {
    handle: string | null;
    color: string;
    Icon: (p: { className?: string }) => React.ReactElement;
  }
> = {
  instagram: { handle: "@vkonautomation", color: "#E1306C", Icon: InstagramIcon },
  facebook: {
    /* The stored link is a `/share/` URL with no handle in it. Rather than
       print the share id as if it were one, the card falls back to the
       location — see `SocialProfileCard`. */
    handle: null,
    color: "#1877F2",
    Icon: FacebookIcon,
  },
  x: { handle: "@vkonautomation", color: "#000000", Icon: XIcon },
  youtube: { handle: "@Vkonautomation", color: "#FF0000", Icon: YouTubeIcon },
  linkedin: { handle: "vkon-automation", color: "#0A66C2", Icon: LinkedInIcon },
};

/* `flatMap` over an empty array rather than `filter(Boolean)`: it drops a
   platform that is in the order but not in `site.socials` (or vice versa)
   without leaving TypeScript to be convinced the result has no holes. */
const PROFILES: SocialProfile[] = PROFILE_ORDER.flatMap((key) => {
  const social = site.socials.find((s) => s.key === key);
  const detail = PROFILE_DETAIL[key];
  if (!social || !detail) return [];
  return [
    {
      key,
      label: social.label,
      href: social.href,
      handle: detail.handle,
      color: detail.color,
      Icon: detail.Icon,
    },
  ];
});

export default function AboutPage() {
  return (
    <>
      {/* The masthead pins and everything under it rises over it as one
          sheet — the same curtain the home page's hero carries (client:
          "Lets have curtain going up feature for about us and contact us
          page where it moves over the top image").

          A plain `top-0` here, with none of the negative-offset
          arithmetic the hero needs: this masthead is a fixed band, 304px
          tall and 360px at `lg`, so it fits inside any viewport we build
          for and pinning its top edge never puts anything of its own out
          of reach. The hero is 817–984px and taller than a phone screen,
          which is the only reason that one is complicated.

          `sticky` replaces the section's own `relative` rather than
          joining it — both set `position`, and the absolutely positioned
          scrim layers inside still resolve against this box either way.
          The `isolate` below is now doing double duty: as well as its
          original job it is what keeps this box's `-z-10` layers from
          competing with the layout's own `-z-10` footer. */}
      {/* Masthead. `isolate` keeps the -z-10 layers inside this section rather
          than sliding behind the page background. Same two-layer scrim and the
          same heights as /contact, so the two mastheads read as a pair. */}
      {/* Masthead pins at z-0 */}
      <section className="sticky top-0 z-0 isolate overflow-hidden">
        <Image
          src="/aboutus-background.jpg"
          alt=""
          fill
          sizes="100vw"
          priority
          className="-z-10 object-cover"
        />

        <div aria-hidden className="absolute inset-0 -z-10 bg-scrim/45 lg:bg-transparent" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-scrim/82 via-scrim/58 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-scrim/55 via-transparent to-transparent"
        />
        <div aria-hidden className="rule-grid absolute inset-0 -z-10 opacity-30" />

        <Container size="wide">
          <div className="flex min-h-[19rem] flex-col justify-end py-12 sm:min-h-[21rem] sm:py-14 lg:min-h-[22.5rem] lg:py-16">
            <h1 className="max-w-3xl text-[2.5rem] leading-[1.02] tracking-tight text-band-ink sm:text-6xl lg:text-[4rem]">
              We make future automation work.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-band-body sm:text-lg">
              Connecting Agritech, Industry and Smart Homes with intelligent IoT.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {["Agritech", "Industry", "Smart Homes"].map((chip) => (
                <li
                  key={chip}
                  className="label-tech rounded-[2px] border border-band-line px-3 py-1.5 text-band-body"
                >
                  {chip}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      {/* Section 01: About us — the first curtain, and the one the header
          watches.

          `data-curtain` is the §9 contract with `layout/Header`: it finds the
          one marked sheet per page and lets its leading edge push the header
          off the top, rather than the header retracting on its own while the
          masthead is still the whole screen. The attribute went missing when
          this page was split from a single sheet into four sectional
          curtains, and it fails silently — `/about` was back on plain
          hide-on-scroll while `/`, `/products` and `/contact` kept the push.
          §01 is the sheet that rises over the masthead here, so it is the one
          that carries it; there must not be a second. */}
      <section data-curtain className="sticky top-0 z-10 flex min-h-[85vh] flex-col justify-center border-t border-line bg-surface py-20 sm:py-24 lg:py-32 shadow-[0_-12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_-12px_30px_rgba(0,0,0,0.4)]">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <RailHeading index="01">About us</RailHeading>

            <div className="max-w-2xl">
              <p className="text-xl leading-snug tracking-tight text-ink sm:text-2xl">
                At {site.legalName}, we improve people&rsquo;s lives and the
                environment with automation and IoT that&rsquo;s reliable,
                efficient, safe and sustainable&mdash;and we make sure it
                works.
              </p>

              <p className="mt-8 text-[1.0625rem] font-medium leading-relaxed text-ink">
                We power automation across every walk of life:
              </p>

              <ul className="mt-8 grid gap-4 sm:grid-cols-3">
                {TRANSITION.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.lead}>
                      <TiltCard className="group h-full">
                        <div className="relative flex h-full flex-col overflow-hidden border border-line bg-surface-raised p-5 shadow-card transition-shadow duration-300 group-hover:shadow-card-hover">
                          <span
                            aria-hidden
                            className="tilt-glare pointer-events-none absolute inset-0"
                          />
                          <div className="tilt-layer flex items-center justify-between">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
                              <Icon className="h-5 w-5" />
                            </span>
                            <span className="label-tech text-muted">
                              {`0${index + 1}`}
                            </span>
                          </div>
                          <p className="tilt-layer mt-4 font-medium text-ink">
                            {item.lead}
                          </p>
                          <p className="tilt-layer mt-2 text-sm leading-relaxed text-body">
                            {item.body}
                          </p>
                        </div>
                      </TiltCard>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* Section 02: Products - Curtain 2 (z-20) */}
      <section className="sticky top-0 z-20 flex min-h-[85vh] flex-col justify-center border-t border-line bg-surface py-20 sm:py-24 lg:py-32 shadow-[0_-12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_-12px_30px_rgba(0,0,0,0.4)]">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <RailHeading index="02">Products</RailHeading>

            <TiltCard className="max-w-2xl">
              <div className="relative overflow-hidden border border-line bg-surface-raised p-6 shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:p-8">
                <span
                  aria-hidden
                  className="tilt-glare pointer-events-none absolute inset-0"
                />
                <span className="tilt-layer flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <FactoryIcon className="h-6 w-6" />
                </span>
                <p className="tilt-layer mt-5 text-2xl leading-snug tracking-tight sm:text-3xl">
                  Explore our products
                </p>
                <p className="tilt-layer mt-4 text-[1.0625rem] leading-relaxed text-body">
                  Motor starters, industrial panels, solar, cables and home
                  automation. Filter the range by category, sub-category or
                  motor rating.
                </p>

                <Button href="/products" size="lg" sweep className="tilt-layer mt-7">
                  See all products
                  <ArrowRightIcon className="h-4 w-4" />
                </Button>
              </div>
            </TiltCard>
          </div>
        </Container>
      </section>

      {/* Section 03: Info — brochure, numbers and the photograph strip as one
          piece, and the curtain that *holds* while §04 is drawn over it
          (client, 2026-09-04: "I want the 04 section to come after 03 ends
          like a curtain").

          **This one is pinned by a negative top offset, and the arithmetic is
          the point.** §01 and §02 are `min-h-[85vh]` and so always shorter
          than the viewport, which is what lets them pin at a plain `top-0`.
          This section cannot be: it carries the brochure card, the figures
          band and the photograph strip, and measures 1325–1547px. A box that
          tall pinned at `top-0` would freeze with its own bottom below the
          fold and leave it there — a pinned box does not scroll, so the
          gallery would become unreachable. `top: 100svh - <height>` is
          negative for exactly the overflow, which delays the pin until the
          section's bottom edge has reached the bottom of the viewport — the
          moment it has been read to the end, and the same moment §04's top
          edge arrives there, since §04 follows it directly in flow. §04 then
          rises over a section that has stopped moving, and `min()` returns
          the plain `0px` on a viewport tall enough to hold all of this, where
          the ordinary top pin is already right.

          **The figure is the section at its tallest per breakpoint, rounded
          up, and erring high is the safe direction** — the mirror of the
          footer's note in the layout. Too high only softens the effect: the
          section locks a few dozen pixels later, with §04 already over its
          foot. Too low pins it early and takes the bottom of the gallery away
          for good. Re-measure if the strip gains photographs or the figures
          band gains a column. */}
      <section className="sticky top-[min(0px,calc(100svh_-_100rem))] z-30 border-t border-line bg-surface py-20 sm:py-24 lg:py-32 shadow-[0_-12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_-12px_30px_rgba(0,0,0,0.4)] md:top-[min(0px,calc(100svh_-_88rem))]">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <RailHeading index="03">Info</RailHeading>

            <div className="min-w-0 max-w-2xl">
              <p className="text-xl leading-snug tracking-tight text-ink sm:text-2xl">
                A closer look at Vkon Automation &mdash; the full range to
                download, a few figures on where we stand, and photographs
                from our own work.
              </p>

              <TiltCard className="mt-8">
                <div className="relative overflow-hidden border border-line bg-surface-raised p-6 shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:p-8">
                  <span
                    aria-hidden
                    className="tilt-glare pointer-events-none absolute inset-0"
                  />
                  <span className="tilt-layer flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <DownloadIcon className="h-6 w-6" />
                  </span>
                  <p className="tilt-layer mt-5 text-2xl leading-snug tracking-tight sm:text-3xl">
                    Download our brochure
                  </p>
                  <p className="tilt-layer mt-4 text-[1.0625rem] leading-relaxed text-body">
                    The full range in one PDF &mdash; ratings, enclosures and
                    protection features, ready to print or forward.
                  </p>

                  <Button
                    href={BROCHURE}
                    download="Vkon-Automation-Brochure.pdf"
                    size="lg"
                    sweep
                    className="tilt-layer mt-7"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Download brochure (PDF)
                  </Button>
                </div>
              </TiltCard>
            </div>
          </div>
        </Container>

        {/* Numbers / Stats section */}
        <div className="mt-16 w-full border-y border-line bg-surface-subtle/80 py-12 sm:py-16 dark:bg-surface-raised">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-y-0 sm:divide-x sm:divide-line">
              {STATS.map((stat) => (
                <div key={stat.label} className="py-6 sm:py-0">
                  <StatCounter
                    value={stat.value}
                    suffix={stat.suffix}
                    label={stat.label}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Image slideshow - part of Section 03 single piece */}
        <div className="mt-16">
          <AboutGallery images={GALLERY} />
        </div>
      </section>

      {/* Section 04: Social media, with the subscribe panel attached to its
          foot — the last block in `main`, and in ordinary flow.

          It is deliberately *not* sticky and carries no trailing scroll room.
          It had both until 2026-09-04 — `sticky top-0` inside a `pb-[80vh]`
          wrapper — and together they were the bug the client reported ("after
          subscribe section i see the 02 explore our product section again"):
          once the wrapper's bottom passed, this section unpinned and scrolled
          away, while §01 and §02 were still pinned at `top-0` behind it. The
          80vh of empty wrapper below the subscribe panel is what they showed
          through, so scrolling past the sign-up replayed "Explore our
          products".

          Ending `main` at this section's foot is what retires those earlier
          curtains for good: a sticky box cannot leave its containing block,
          so §01–§03 can never sit below this section's bottom edge, and at
          `z-40` this section covers all three until the page slides away.

          That slide is the last curtain and it belongs to the layout, not
          here: the footer is pinned at the bottom *behind* `main`, so
          scrolling on past the subscribe panel opens it rather than scrolling
          down to it (client: "as we scroll down it opens the bottom most
          section like a curtain"). Adding padding, a spacer or another
          section after this one would break that by putting something between
          the sign-up and the page's bottom edge. */}
      <section className="relative z-40 border-t border-line bg-surface pt-20 sm:pt-24 lg:pt-32 shadow-[0_-12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_-12px_30px_rgba(0,0,0,0.4)]">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <RailHeading index="04">Social media</RailHeading>

            <div className="min-w-0">
              <p className="max-w-2xl text-xl leading-snug tracking-tight text-ink sm:text-2xl">
                Follow along for installations, new panels and product updates
                as we publish them.
              </p>

              <ul className="mt-8 grid grid-cols-1 gap-x-3 gap-y-8 lg:grid-cols-5">
                {PROFILES.map((profile) => (
                  <li key={profile.key} className="min-w-0">
                    <SocialProfileCard profile={profile} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>

        {/* Subscribe panel attached directly to the foot of §04 — no gap, no
            section of its own, so the two read as one closing block. */}
        <div className="mt-16 border-t border-line">
          <SubscribePanel />
        </div>
      </section>

      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "About Us", path: "/about" },
        ])}
      />
    </>
  );
}

/** Numbered mono heading for a section's left rail — a small technical cue
 *  that also gives the sections a visible running order. */
function RailHeading({
  index,
  children,
}: {
  index: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 pt-2 lg:flex-col lg:gap-1">
      <span className="label-tech text-accent">{index}</span>
      <h2 className="label-tech text-muted">{children}</h2>
    </div>
  );
}
