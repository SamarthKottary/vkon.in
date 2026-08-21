import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  FactoryIcon,
  FlagIcon,
  HeartIcon,
  HomeIcon,
  InstagramIcon,
  SproutIcon,
  TargetIcon,
} from "@/components/icons/ui";
import { TiltCard } from "@/components/about/TiltCard";
import { SubscribePanel } from "@/components/layout/SubscribePanel";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { JsonLd } from "@/components/ui/JsonLd";
import { site } from "@/content/site";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "About Us",
  description: `${site.legalName} builds smart automation and IoT technology for homes, farms and industry — more reliable, efficient, safe and sustainable.`,
  path: "/about",
});

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

const CULTURE = [
  "Help our employees grow and succeed in their jobs and in their personal lives.",
  "Make our customers happy by understanding their problems and actively giving them real solutions.",
  "Do the right thing to deliver results for our shareholders.",
  "Support our communities by using our time and skills to help where we live and work.",
];

const GOALS = [
  "Be the top choice and preferred supplier for our customers and partners.",
  "Make sure our employees find their work exciting, engaging, and meaningful.",
  "Build stronger communities.",
  "Keep our employees healthy, well, and safe.",
  "Be a great example of inclusion and diversity in the tech industry.",
];

const instagram = site.socials.find((s) => s.key === "instagram");

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
          <nav aria-label="Breadcrumb">
            <ol className="label-tech flex flex-wrap items-center gap-2 text-muted">
              <li>
                <Link href="/" className="hover:text-ink">
                  Home
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li aria-current="page">About Us</li>
            </ol>
          </nav>

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

              <div className="mt-8 space-y-5 text-[1.0625rem] leading-relaxed text-body">
                <p>
                  Automation is moving beyond industry into daily life. From
                  homes to farms, smart technology turns isolated tasks into
                  connected systems you monitor and control from your phone.
                </p>
                <p className="font-medium text-ink">
                  We power this shift across every walk of life:
                </p>
              </div>

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

              <p className="mt-8 text-[1.0625rem] leading-relaxed text-body">
                Our vision is to guide society through this shift&mdash;building
                the bridge between complex hardware and intuitive experiences,
                so automation feels like second nature and smart control fits
                in the palm of your hand.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-line py-14 sm:py-16">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <RailHeading index="02">Vision &amp; Goals</RailHeading>

            <div className="max-w-2xl">
              <p className="text-xl leading-snug tracking-tight text-ink sm:text-2xl">
                We&rsquo;re a smart automation and IoT company&mdash;but what
                matters more is that our work lifts quality of life and
                protects the environment.
              </p>

              <h3 className="mt-12 flex items-center gap-3 text-2xl tracking-tight sm:text-3xl">
                <IconBadge>
                  <TargetIcon className="h-5 w-5" />
                </IconBadge>
                Our Vision
              </h3>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-body">
                Our vision is to improve people&rsquo;s lives and the
                environment by using smart automation and IoT technologies.
              </p>

              <h3 className="mt-12 flex items-center gap-3 text-2xl tracking-tight sm:text-3xl">
                <IconBadge>
                  <HeartIcon className="h-5 w-5" />
                </IconBadge>
                Our Culture
              </h3>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-body">
                Our culture is built on our purpose, beliefs and attitudes. To
                make our vision real as demand grows, we hold to the following:
              </p>
              <BulletList items={CULTURE} />

              <p className="mt-8 text-[1.0625rem] leading-relaxed text-body">
                Our brand promise is simple: we make what matters work&mdash;safer,
                more reliable, efficient and sustainable, for our people,
                customers and communities. It guides everything we do, from who
                we hire to what we build.
              </p>

              <h3 className="mt-12 flex items-center gap-3 text-2xl tracking-tight sm:text-3xl">
                <IconBadge>
                  <FlagIcon className="h-5 w-5" />
                </IconBadge>
                Our Aspirational Goals
              </h3>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-body">
                Our big goals matter as much to us as our financial targets.
                They rally the whole team around who we are. We aim to:
              </p>
              <BulletList items={GOALS} />
            </div>
          </div>
        </Container>
      </section>

      {instagram && (
        <section className="border-t border-line py-14 sm:py-16">
          <Container size="wide">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
              <RailHeading index="03">Instagram</RailHeading>

              {/* A profile card, not an embedded feed. A live Instagram feed
                  needs either Meta's embed script or a third-party widget,
                  both of which are third-party requests that set cookies on
                  arrival — §9 forbids those before a visitor asks — and the
                  Graph API route needs an app, a refreshing token and a
                  dependency the runtime policy does not have room for. This
                  costs nothing and always works. */}
              <div className="reveal max-w-2xl border border-line bg-surface-raised p-6 shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:p-8">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <InstagramIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-lg text-ink">Follow us on Instagram</p>
                    <p className="font-mono text-sm text-muted">
                      @{instagram.href.replace(/^.*instagram\.com\//, "")}
                    </p>
                  </div>
                </div>

                {/* Forward-looking on purpose: the account had no posts yet
                    when this went up, so copy describing a feed of work would
                    send people to an empty profile. Worth revisiting once
                    there is something to look at. */}
                <p className="mt-5 leading-relaxed text-body">
                  Follow along for installations, new panels and product
                  updates as we publish them.
                </p>

                <Button
                  href={instagram.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="lg"
                  className="mt-6"
                >
                  <InstagramIcon className="h-4 w-4" />
                  Open our profile
                </Button>
              </div>
            </div>
          </Container>
        </section>
      )}

      <section className="border-t border-line py-14 sm:py-16">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <RailHeading index="04">Products</RailHeading>

            <div className="reveal max-w-2xl border border-line bg-surface-raised p-6 shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                <FactoryIcon className="h-6 w-6" />
              </span>
              <p className="mt-5 text-2xl leading-snug tracking-tight sm:text-3xl">
                Explore our products
              </p>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-body">
                Motor starters, solar controllers, cables and home automation.
                Filter the range by category, sub-category or motor rating.
              </p>

              <Button href="/products" size="lg" className="mt-7">
                See all products
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
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

/** Small square accent badge for a heading's theme icon. Square, not a pill —
 *  2px corners are the house rule; the round badge is reserved for the market
 *  cards' floating marks. */
function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] bg-accent-soft text-accent">
      {children}
    </span>
  );
}

/** Bulleted list with an accent check per item, matching the protection list's
 *  rhythm. */
function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-3">
      {items.map((item) => (
        <li
          key={item}
          className="flex gap-3 text-[1.0625rem] leading-relaxed text-body"
        >
          <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          {item}
        </li>
      ))}
    </ul>
  );
}
