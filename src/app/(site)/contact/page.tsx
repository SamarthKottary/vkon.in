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
 * **The masthead carries a two-layer scrim** — a flat floor and a horizontal
 * pass, both `bg-scrim/*`. The scrim came off briefly on 2026-08-19 and went
 * back the same day: this photograph varies enough top-to-bottom (pale sky,
 * bright tractors, darker crops) that white type without a scrim only just
 * clears AA on the darker areas and fails on the lighter ones. A text-shadow
 * was tried in that no-scrim interval; the scrim does the job more cleanly.
 *
 * **The map is Google Maps, overriding §9.** §9 forbids third-party embeds
 * that load before a visitor asks, because a Google Maps iframe sets
 * advertising cookies on arrival. The client asked for Google Maps anyway on
 * 2026-08-19, and this note records the trade: on first arrival at this page,
 * a visitor's browser talks to Google and stores its cookies whether or not
 * they engage with the map. The `output=embed` URL avoids the API-key
 * dependency, so a deploy still does not rely on a billing account.
 */
export default function ContactPage() {
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
          rather than sliding behind the page background. Heights are ~25%
          shorter than the earlier crop (client request, 2026-08-19). */}
      <section className="relative isolate overflow-hidden">
        <Image
          src="/contactus-background.jpg"
          alt=""
          fill
          sizes="100vw"
          priority
          className="-z-10 object-cover"
        />

        {/* Two layers: a flat floor for the narrow layout where the copy sits
            over crops, and a horizontal pass so the pale sky at the top does
            not wash the tagline out on wider screens where the text takes more
            room. Same idiom as the hero and the sign-up panel. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-scrim/45 lg:bg-scrim/30" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-scrim/80 via-scrim/55 to-scrim/25"
        />

        <Container size="wide">
          <div className="flex min-h-[12rem] flex-col justify-end py-12 sm:min-h-[15rem] sm:py-14 lg:min-h-[18rem] lg:py-16">
            <h1 className="max-w-3xl text-[2.25rem] leading-[1.08] text-band-ink sm:text-5xl lg:text-[3.5rem]">
              Tell us what you&rsquo;re running
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-band-body sm:mt-4 sm:text-lg">
              Call, WhatsApp or write below — all three reach the same desk.
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

              {/* Google Maps embed via the keyless `output=embed` URL — see
                  the note at the top of this file for the §9 override. `lazy`
                  so tiles are not fetched for a visitor who never scrolls
                  here, and a `title` because an iframe without an accessible
                  name is announced as "frame" and nothing else. */}
              <div className="mt-6 aspect-[4/3] w-full overflow-hidden border border-line bg-surface-subtle">
                <iframe
                  title={`Map showing ${site.address.locality}, ${site.address.region}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://maps.google.com/maps?q=${MAP.lat},${MAP.lon}&z=15&output=embed`}
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
