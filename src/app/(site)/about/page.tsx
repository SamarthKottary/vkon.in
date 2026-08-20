import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, InstagramIcon } from "@/components/icons/ui";
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
 */

/** "In daily living:" etc. The lead-in is part of the sentence, not a label. */
const TRANSITION = [
  {
    lead: "In daily living",
    body: "Homeowners are embracing smart lighting and climate controls for unparalleled convenience, safety, and energy efficiency.",
  },
  {
    lead: "In agriculture",
    body: "Modern farmers are adopting automated systems to save scarce resources like water and nutrients, cut operational costs, and boost productivity.",
  },
  {
    lead: "In industry",
    body: "Facility managers are utilizing predictive sensors to monitor environmental shifts in real-time, ensuring safety and compliance without constant manual oversight.",
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

        <div aria-hidden className="absolute inset-0 -z-10 bg-scrim/45 lg:bg-scrim/30" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-scrim/80 via-scrim/55 to-scrim/25"
        />

        <Container size="wide">
          <div className="flex min-h-[12rem] flex-col justify-end py-12 sm:min-h-[15rem] sm:py-14 lg:min-h-[18rem] lg:py-16">
            <h1 className="max-w-3xl text-[2.25rem] leading-[1.08] text-band-ink sm:text-5xl lg:text-[3.5rem]">
              About Us
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-band-ink sm:mt-4 sm:text-lg">
              {site.legalName}: We make what future automation is all about.
            </p>
            <p className="mt-1.5 max-w-2xl text-base leading-relaxed text-band-body sm:text-lg">
              Seamlessly connecting Agritech, Industry, and Smart Homes with
              intelligent IoT solutions.
            </p>
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
            <h2 className="label-tech pt-2 text-muted">About us</h2>

            <div className="max-w-2xl">
              {/* The opening paragraph is the company's positioning statement,
                  so it is set larger than the body that follows it. */}
              <p className="text-lg leading-relaxed text-ink sm:text-xl">
                At {site.legalName}, we&rsquo;re dedicated to improving
                people&rsquo;s lives and the environment with automation and
                IoT technologies that are more reliable, efficient, safe, and
                sustainable. Because that&rsquo;s what really matters. And
                we&rsquo;re here to make sure it works.
              </p>

              <div className="mt-8 space-y-6 text-[1.0625rem] leading-relaxed text-body">
                <p>
                  Automation is moving beyond industry to simplify our daily
                  lives. From homes to farms, smart technology transforms
                  isolated tasks into connected systems, allowing you to
                  monitor, control, and make data-driven decisions directly
                  from your smartphone or laptop.
                </p>
                <p>We are empowering this transition across all walks of life:</p>
              </div>

              <ul className="mt-8 space-y-5 border-l-2 border-accent pl-6">
                {TRANSITION.map((item) => (
                  <li
                    key={item.lead}
                    className="text-[1.0625rem] leading-relaxed text-body"
                  >
                    <strong className="font-medium text-ink">
                      {item.lead}:
                    </strong>{" "}
                    {item.body}
                  </li>
                ))}
              </ul>

              <p className="mt-8 text-[1.0625rem] leading-relaxed text-body">
                Our vision at {site.legalName} is to guide society through this
                technological shift. We build the bridges between complex
                hardware and intuitive user experiences so that adapting to
                automation doesn&rsquo;t feel complicated&mdash;it feels like
                second nature. By putting smart control in the palm of your
                hand, we are shaping a future where everyday technology
                empowers every person, every day.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-line py-14 sm:py-16">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <h2 className="label-tech pt-2 text-muted">Vision &amp; Goals</h2>

            <div className="max-w-2xl">
              <p className="text-lg leading-relaxed text-ink sm:text-xl">
                We are a smart automation and IoT company, but more
                importantly, our work improves the quality of life and protects
                the environment. Our technology, products, and services create
                a real difference in the world.
              </p>

              <h3 className="mt-12 text-2xl sm:text-3xl">Our Vision</h3>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-body">
                Our vision is to improve people&rsquo;s lives and the
                environment by using smart automation and IoT technologies.
              </p>

              <h3 className="mt-12 text-2xl sm:text-3xl">Our Culture</h3>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-body">
                Our company culture is built on our unique purpose, beliefs,
                and attitudes. To make our vision a reality as the need for
                smart automation grows, we know we must do the following:
              </p>
              <BulletList items={CULTURE} />

              <p className="mt-8 text-[1.0625rem] leading-relaxed text-body">
                Our brand promise is simple: we make what matters work. We do
                this to make things safer, more reliable, highly efficient, and
                sustainable in ways that truly matter to our employees,
                customers, and communities. These values guide everything we
                do&mdash;from the people we hire to the IoT products we create.
              </p>

              <h3 className="mt-12 text-2xl sm:text-3xl">
                Our Aspirational Goals
              </h3>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-body">
                Reaching our big goals is just as important to us as meeting
                our financial targets. These goals bring our whole team
                together around who we are as an automation company.
              </p>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-body">
                We aim to:
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
              <h2 className="label-tech pt-2 text-muted">Instagram</h2>

              {/* A profile card, not an embedded feed. A live Instagram feed
                  needs either Meta's embed script or a third-party widget,
                  both of which are third-party requests that set cookies on
                  arrival — §9 forbids those before a visitor asks — and the
                  Graph API route needs an app, a refreshing token and a
                  dependency the runtime policy does not have room for. This
                  costs nothing and always works. */}
              <div className="max-w-2xl border border-line bg-surface-raised p-6 shadow-card sm:p-8">
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
            <h2 className="label-tech pt-2 text-muted">Products</h2>

            <div className="max-w-2xl">
              <p className="text-2xl leading-snug sm:text-3xl">
                Explore our products
              </p>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-body">
                Motor starters, solar controllers, cables and home automation —
                filter the full range by category, sub-category or the motor
                rating you need.
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

/** Ruled bullet list, matching the protection list's rhythm. */
function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-3">
      {items.map((item) => (
        <li
          key={item}
          className="flex gap-3 text-[1.0625rem] leading-relaxed text-body"
        >
          <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 bg-accent" />
          {item}
        </li>
      ))}
    </ul>
  );
}
