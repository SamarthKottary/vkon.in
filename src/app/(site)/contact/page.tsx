import Image from "next/image";
import Link from "next/link";
import { EnquiryForm } from "@/components/contact/EnquiryForm";
import { ArrowRightIcon } from "@/components/icons/ui";
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
 * Contact page: the enquiry form on the left, the location on the right, over a
 * photograph.
 *
 * The call / WhatsApp / email row that used to run across the top was removed
 * on 2026-08-19 at the client's request. Those channels are still one tap away
 * everywhere — the floating buttons on desktop, `MobileActionBar` on a phone,
 * and the footer on both — so removing the row costs a visitor nothing and
 * makes this page about the one thing it is for.
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
      <section className="relative isolate overflow-hidden">
        <Image
          src="/contactus-background.jpg"
          alt=""
          fill
          sizes="100vw"
          priority
          className="-z-10 object-cover"
        />

        {/* Same three-layer idiom as the hero and the sign-up: a flat floor for
            the narrow layout where the form spans the full width, a horizontal
            pass for the wide one where it stays left, and a vertical pass so
            the pale sky at the top of the frame does not wash out the heading.
            Measured against rendered pixels — see docs/ARCHITECTURE.md §10. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-scrim/50 lg:bg-scrim/28" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-scrim/90 via-scrim/70 to-scrim/40"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-b from-scrim/45 to-transparent"
        />

        <Container size="wide">
          <div className="py-12 sm:py-16 lg:py-20">
            <nav aria-label="Breadcrumb" className="mb-8">
              <ol className="label-tech flex flex-wrap items-center gap-2 text-band-muted">
                <li>
                  <Link href="/" className="hover:text-band-ink">
                    Home
                  </Link>
                </li>
              </ol>
            </nav>

            <p className="label-tech text-band-accent">Contact</p>

            <h1 className="mt-4 max-w-3xl text-[2.25rem] leading-[1.08] text-band-ink sm:text-5xl lg:text-[3.5rem]">
              Tell us what you&apos;re running
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-band-body">
              Motor rating, supply type and location is usually all we need to
              point you at the right panel and your nearest dealer.
            </p>
          </div>

          <div className="grid gap-12 pb-14 sm:pb-16 lg:grid-cols-2 lg:gap-16 lg:pb-20">
            <div>
              <h2 className="text-2xl text-band-ink sm:text-3xl">
                Send us an enquiry
              </h2>
              <p className="mt-4 max-w-xl leading-relaxed text-band-body">
                We read these through the working day and reply on whichever of
                your phone or email you leave below. If the pump is down today,
                call — that is always faster than a form.
              </p>

              <div className="mt-10">
                <EnquiryForm />
              </div>
            </div>

            <div>
              <h2 className="text-2xl text-band-ink sm:text-3xl">Where we are</h2>

              {/* `loading="lazy"` so the tiles are not fetched for a visitor who
                  never scrolls this far, and a `title` because an iframe with
                  no accessible name is announced as "frame" and nothing else. */}
              <div className="mt-6 aspect-[4/3] w-full overflow-hidden border border-band-line bg-band-raised">
                <iframe
                  title={`Map showing ${site.address.locality}, ${site.address.region}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${MAP.lat},${MAP.lon}`}
                  className="h-full w-full border-0"
                />
              </div>

              <address className="mt-6 not-italic leading-relaxed text-band-body">
                {formattedAddress}
              </address>

              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link-cta link-cta-band mt-5"
              >
                Open in Google Maps
                <ArrowRightIcon className="h-4 w-4" />
              </a>

              <p className="label-tech mt-8 border-t border-band-line pt-6 text-band-muted">
                Hours
              </p>
              <p className="mt-3 leading-relaxed text-band-body">{site.hours}</p>
            </div>
          </div>
        </Container>
      </section>

      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ])}
      />
    </>
  );
}
