import Image from "next/image";
import Link from "next/link";
import { EnquiryForm } from "@/components/contact/EnquiryForm";
import { ArrowRightIcon } from "@/components/icons/ui";
import { SubscribePanel } from "@/components/layout/SubscribePanel";
import { Container } from "@/components/ui/Container";
import { JsonLd } from "@/components/ui/JsonLd";
import { formattedAddress, site } from "@/content/site";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Contact",
  description: `Send an enquiry to ${site.name} — motor starters and control panels built in ${site.address.locality}, ${site.address.region}. Tell us the motor rating and your location and we will point you at the right panel.`,
  path: "/contact",
});

export const dynamic = "force-dynamic";

/**
 * Approximate coordinates for the map pin.
 *
 * TODO(vkon): these are the centre of Kolar Gold Fields, not the works. The
 * address in `site.ts` is still a placeholder, so this is deliberately a town
 * rather than a building — a pin dropped on a specific street we have not
 * confirmed would be confidently wrong, which is worse than approximately
 * right. Replace both together.
 */
const MAP = { lat: 12.9558, lon: 78.2739, span: 0.04 };

/**
 * Contact page.
 *
 * **The photograph is a masthead, not a backdrop.** It ran behind the whole
 * page until 2026-08-19; everything below the headline now sits on an ordinary
 * surface. That is why `EnquiryForm` uses page tokens rather than `band-*` —
 * see the note on it before moving either.
 *
 * The masthead carries the headline and nothing else, at the client's request.
 * The breadcrumb moved below it rather than being dropped: it is navigation,
 * and losing it would leave this page with no route back that is not the
 * header.
 *
 * **The map renders immediately, and it is OpenStreetMap rather than Google.**
 * That is the whole reason it can render immediately: §9 forbids third-party
 * embeds that load before a visitor asks, because a Google Maps iframe sets
 * advertising cookies on arrival. OSM sets none — it is a tile server, not an
 * ad network — so there is nothing to defer behind a click. It also needs no
 * API key, which keeps a deploy from depending on a billing account.
 */
export default function ContactPage() {
  const bbox = [
    MAP.lon - MAP.span,
    MAP.lat - MAP.span / 2,
    MAP.lon + MAP.span,
    MAP.lat + MAP.span / 2,
  ].join(",");

  const mapsQuery = encodeURIComponent(
    [
      site.address.street,
      site.address.locality,
      site.address.region,
      site.address.postalCode,
      site.address.countryName,
    ].join(", "),
  );

  return (
    <>
      {/* Masthead. `isolate` so the -z-10 layers stay inside this section
          rather than sliding behind the page background. */}
      <section className="relative isolate overflow-hidden">
        <Image
          src="/contactus-background.jpg"
          alt=""
          fill
          sizes="100vw"
          priority
          className="-z-10 object-cover"
        />

        {/* Two layers, not the hero's three: there is only a headline here, it
            sits left, and it is large enough to need 3:1 rather than 4.5:1. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-scrim/45 lg:bg-scrim/30" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-scrim/80 via-scrim/55 to-scrim/25"
        />

        <Container size="wide">
          <div className="flex min-h-[16rem] items-end py-16 sm:min-h-[20rem] sm:py-20 lg:min-h-[24rem] lg:py-24">
            <h1 className="max-w-3xl text-[2.25rem] leading-[1.08] text-band-ink sm:text-5xl lg:text-[3.5rem]">
              Tell us what you&rsquo;re running
            </h1>
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
              <li aria-current="page">Contact</li>
            </ol>
          </nav>

          <div className="mt-10 grid gap-12 lg:grid-cols-2 lg:gap-16">
            {/* White card on the meadow canvas (2026-08-19 client request). The
                map column stays open on the canvas by design — a single card
                emphasises the form as the primary action, and the map iframe
                already carries its own bordered plate. */}
            <div className="border border-line bg-surface-raised p-6 shadow-card sm:p-8 lg:p-10">
              <h2 className="text-2xl sm:text-3xl">Send us an enquiry</h2>
              <p className="mt-4 max-w-xl leading-relaxed text-body">
                Motor rating, supply type and location is usually all we need to
                point you at the right panel and your nearest dealer. We read
                these through the working day and reply on whichever of your
                phone or email you leave below. If the pump is down today, call
                — that is always faster than a form.
              </p>

              <div className="mt-10">
                <EnquiryForm />
              </div>
            </div>

            <div>
              <h2 className="text-2xl sm:text-3xl">Where we are</h2>

              {/* `loading="lazy"` so the tiles are not fetched for a visitor who
                  never scrolls this far, and a `title` because an iframe with
                  no accessible name is announced as "frame" and nothing else. */}
              <div className="mt-6 aspect-[4/3] w-full overflow-hidden border border-line bg-surface-subtle">
                <iframe
                  title={`Map showing ${site.address.locality}, ${site.address.region}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${MAP.lat},${MAP.lon}`}
                  className="h-full w-full border-0"
                />
              </div>

              <address className="mt-6 not-italic leading-relaxed text-body">
                {formattedAddress}
              </address>

              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link-cta mt-5"
              >
                Open in Google Maps
                <ArrowRightIcon className="h-4 w-4" />
              </a>

              <p className="label-tech mt-8 border-t border-line pt-6 text-muted">
                Hours
              </p>
              <p className="mt-3 leading-relaxed text-body">{site.hours}</p>
            </div>
          </div>
        </Container>
      </section>

      <SubscribePanel />

      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ])}
      />
    </>
  );
}
