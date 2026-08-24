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
      {/* Masthead. `isolate` keeps the -z-10 layers inside this section rather
          than sliding behind the page background. Same two-layer scrim and the
          same heights as /contact, so the two mastheads read as a pair. */}
      <section className="relative isolate overflow-hidden">
        <Image
          src="/aboutus-background.jpg"
          alt=""
          fill
          sizes="100vw"
          priority
          className="-z-10 object-cover"
        />

        {/* Shaped like the hero's: heavy left, falling to transparent at the
            right edge so the photograph's subject is seen rather than dimmed.
            The flat floor is mobile-only — at 390px the copy spans the full
            width, so a left-weighted gradient covers none of it — and lifts
            entirely at `lg`, where the copy stays in the left column.

            The headline and tagline sit at the *bottom* left here, not the top,
            so the third layer is a bottom band rather than the hero's top-left
            diagonal. Measured against rendered pixels; see the note in
            `HeroRotator`. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-scrim/45 lg:bg-transparent" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-scrim/82 via-scrim/58 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-scrim/55 via-transparent to-transparent"
        />
        {/* Faint engineering grid over the photo — a quiet technical texture
            that reads as futuristic without competing with the headline. */}
        <div aria-hidden className="rule-grid absolute inset-0 -z-10 opacity-30" />

        <Container size="wide">
          <div className="flex min-h-[14rem] flex-col justify-end py-12 sm:min-h-[17rem] sm:py-14 lg:min-h-[21rem] lg:py-16">
            <p className="label-tech text-band-accent">About · {site.name}</p>
            <h1 className="mt-3 max-w-3xl text-[2.5rem] leading-[1.02] tracking-tight text-band-ink sm:text-6xl lg:text-[4rem]">
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

      <section className="py-12 sm:py-14 lg:py-16">
        <Container size="wide">

          <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <RailHeading index="01">About us</RailHeading>

            <div className="max-w-2xl">
              {/* The opening paragraph is the company's positioning statement,
                  so it is set larger than the body that follows it. */}
              <p className="text-xl leading-snug tracking-tight text-ink sm:text-2xl">
                At {site.legalName}, we improve people&rsquo;s lives and the
                environment with automation and IoT that&rsquo;s reliable,
                efficient, safe and sustainable&mdash;and we make sure it
                works.
              </p>

              {/* Reworded from "We power this shift across every walk of
                  life:" when the paragraph above it was cut on 2026-08-24.
                  "This shift" pointed at that paragraph; with it gone the
                  phrase referred to nothing. The lead-in itself has to stay in
                  some form — it is the sentence the three cards complete. */}
              <p className="mt-8 text-[1.0625rem] font-medium leading-relaxed text-ink">
                We power automation across every walk of life:
              </p>

              {/* The three markets as 3D tilt cards. `[perspective]` lives on
                  the grid, not each card, so neighbours share one vanishing
                  point and the row reads as one plane rather than three. The
                  icon sits on a `tilt-layer` that stands off the card face, so
                  it floats above the copy as the card leans. */}
              <ul className="reveal mt-8 grid gap-4 sm:grid-cols-3">
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


      <section className="border-t border-line py-14 sm:py-16">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <RailHeading index="02">Products</RailHeading>

            <div className="reveal max-w-2xl border border-line bg-surface-raised p-6 shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                <FactoryIcon className="h-6 w-6" />
              </span>
              <p className="mt-5 text-2xl leading-snug tracking-tight sm:text-3xl">
                Explore our products
              </p>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-body">
                Motor starters, industrial panels, solar, cables and home
                automation. Filter the range by category, sub-category or motor
                rating.
              </p>

              <Button href="/products" size="lg" className="mt-7">
                See all products
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-line py-14 sm:py-16">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <RailHeading index="03">Info</RailHeading>

            {/* `max-w-2xl` on the column rather than on the card, so the
                brochure card, the figures and the photo strip share one right
                edge — and the same one as §02 and §04. `min-w-0` because the
                gallery is a horizontal scroller: without it the column takes
                its min-content width from the whole strip and pushes the grid
                wider than the page. */}
            <div className="min-w-0 max-w-2xl">
              <div className="reveal border border-line bg-surface-raised p-6 shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:p-8">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <DownloadIcon className="h-6 w-6" />
                </span>
                <p className="mt-5 text-2xl leading-snug tracking-tight sm:text-3xl">
                  Download our brochure
                </p>
                <p className="mt-4 text-[1.0625rem] leading-relaxed text-body">
                  The full range in one PDF &mdash; ratings, enclosures and
                  protection features, ready to print or forward.
                </p>

                {/* `download` asks the browser to save rather than navigate,
                    and names the saved file: without the attribute a PDF opens
                    in the built-in viewer on most desktops, which is not what
                    a button reading "Download" promises. Same-origin, so the
                    attribute is honoured. */}
                <Button
                  href={BROCHURE}
                  download="Vkon-Automation-Brochure.pdf"
                  size="lg"
                  className="mt-7"
                >
                  <DownloadIcon className="h-4 w-4" />
                  Download brochure (PDF)
                </Button>
              </div>

              {/* The figures. A plain grid rather than cards: three bordered
                  boxes here would compete with the brochure card directly
                  above and the photographs directly below. */}
              {/* `divide-x` only from `sm`: stacked on a phone the rules would
                  run horizontally between the figures and read as three
                  separate rows rather than one band. The `border-y` closes the
                  band top and bottom at every width. */}
              <div className="mt-12 grid grid-cols-1 gap-8 border-y border-line py-10 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line">
                {STATS.map((stat) => (
                  <div key={stat.label}>
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
        </Container>

        {/* Outside the `Container`, so the strip runs from the left edge of
            the window to the right (client, 2026-08-24). Done by placement
            rather than the usual `w-screen left-1/2 -mx-[50vw]` trick, which
            measures `100vw` *including* the scrollbar and so overflows the
            page by its width on every desktop browser that reserves one.
            `AboutGallery` puts its own controls back inside a Container so
            they still line up with the text above. */}
        <div className="mt-12">
          <AboutGallery images={GALLERY} />
        </div>
      </section>

      <section className="border-t border-line py-14 sm:py-16">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <RailHeading index="04">Social media</RailHeading>

            {/* No `max-w-2xl` here, unlike §01–§03. Five cards in one row
                need the whole column: capped at 2xl each would be ~130px and
                the platform names would not fit. The standfirst keeps its own
                measure so the prose still reads at a comfortable line length
                — it is the card row, not the text, that wants the width. */}
            <div className="min-w-0">
              <p className="max-w-2xl text-xl leading-snug tracking-tight text-ink sm:text-2xl">
                Follow along for installations, new panels and product updates
                as we publish them.
              </p>

              {/* Rows down the page below `lg`, one row of five from it
                  (client, 2026-08-24). `SocialProfileCard` changes shape at
                  the same breakpoint — horizontal in the stacked form,
                  vertical in the row — so the two have to move together.

                  `items-stretch` is implicit in a grid, and the card is
                  `h-full`, which is what makes the five equal height with
                  their buttons aligned rather than each ending where its own
                  text does.

                  Order is still the client's — Instagram, Facebook, X,
                  YouTube, LinkedIn — and lives in `PROFILE_ORDER`. */}
              <ul className="mt-8 grid grid-cols-1 gap-x-3 gap-y-8 lg:grid-cols-5">
                {PROFILES.map((profile) => (
                  /* `min-w-0` for the same reason `ProductCatalogue` needs
                     `minmax(0,1fr)`: the card's chrome bar holds a
                     `white-space: nowrap` URL whose min-content width is the
                     whole string, and a track sized `auto` takes its minimum
                     from exactly that. Without it the column widened to fit
                     LinkedIn's URL and put five pixels of horizontal scroll on
                     a 390px phone. `min-w-0` on the truncating span alone does
                     not do it — that frees the flex item, not its container. */
                  <li key={profile.key} className="min-w-0">
                    <SocialProfileCard profile={profile} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      <SubscribePanel />

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
