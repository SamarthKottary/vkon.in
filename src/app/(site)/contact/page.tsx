import Image from "next/image";
import { TiltCard } from "@/components/about/TiltCard";
import { EnquiryForm } from "@/components/contact/EnquiryForm";
import { ArrowRightIcon } from "@/components/icons/ui";
import { SubscribePanel } from "@/components/layout/SubscribePanel";
import { Container } from "@/components/ui/Container";
import { JsonLd } from "@/components/ui/JsonLd";
import { formattedAddress, site } from "@/content/site";
import { breadcrumbJsonLd } from "@/lib/seo";
import { resolvePageMetadata } from "@/lib/db/pageSeo";

export async function generateMetadata() {
  return resolvePageMetadata({
    title: "Contact",
    description: `Send an enquiry to ${site.name} — motor starters, control panels, solar and home automation, built in ${site.address.locality}, ${site.address.region}. Tell us what you need and we'll point you at the right product and your nearest dealer.`,
    path: "/contact",
  });
}

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

        <Container size="wide">
          <div className="flex min-h-[12rem] flex-col justify-end py-12 sm:min-h-[15rem] sm:py-14 lg:min-h-[18rem] lg:py-16">
            <h1 className="max-w-3xl text-[2.25rem] leading-[1.08] text-band-ink sm:text-5xl lg:text-[3.5rem]">
              Tell us what you need
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-band-body sm:mt-4 sm:text-lg">
              Call, WhatsApp or write below — all three reach the same desk.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-12 sm:py-14 lg:py-16">
        <Container size="wide">

          <div className="mt-10 grid gap-12 lg:grid-cols-2 lg:gap-16">
            {/* White card on the meadow canvas (2026-08-19 client request). The
                map column stays open on the canvas by design — a single card
                emphasises the form as the primary action, and the map iframe
                already carries its own bordered plate.

                **`TiltCard max={0}` (client, 2026-08-27: "add the same glowing
                white in dark mode and green in light mode animation to the
                send us an enquiry box", then same day: "I just want the
                glowing animation, not distorting the enquiry box")** — glow
                only, rotation switched off. `max` scales `--rx`/`--ry` in
                `TiltCard` (`(0.5 - py) * max * 2`, `(px - 0.5) * max * 2`), so
                `max={0}` holds both at a permanent `0deg` while `--mx`/`--my`
                and `data-active` — the glow's only inputs — are untouched;
                no change to `TiltCard.tsx` or `globals.css`, and no effect on
                the about page's own `TiltCard`s, which don't pass `max`. No
                `tilt-layer` on the children either, unlike the about page's
                boxes: that class puts a `translateZ(2.2rem)` on each child,
                which under the wrapper's `perspective(900px)` reads as a
                permanent ~4% enlargement even at `0deg` rotation (perspective
                scales a z-translated element regardless of tilt) — a static
                residual the client's "not distorting" wouldn't want kept, and
                with rotation off there is no tilted face left for it to stand
                off of anyway. No `max-w-*` on `TiltCard` itself, unlike the
                about page's usage — there it was needed because those boxes
                sit in a `grid-cols-[...]` layout with room to spare; here the
                grid column (`lg:grid-cols-2` above) already constrains the
                width, and `TiltCard` renders a plain block `<div>` that fills
                it without help. */}
            <TiltCard max={0}>
              <div className="relative overflow-hidden border border-line bg-surface-raised p-6 shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:p-8 lg:p-10">
                <span
                  aria-hidden
                  className="tilt-glare pointer-events-none absolute inset-0"
                />
                <h2 className="text-2xl sm:text-3xl">Send us an enquiry</h2>
                <p className="mt-4 max-w-xl leading-relaxed text-body">
                  Tell us what you need and where you are &mdash; pumps, panels,
                  solar or home automation. We&rsquo;ll point you at the right
                  product and your nearest dealer, and reply by phone or email.
                  Urgent? Call &mdash; it&rsquo;s faster than a form.
                </p>

                <div className="mt-10">
                  <EnquiryForm />
                </div>
              </div>
            </TiltCard>

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

              {/* `product/ProductCard`'s "View details" pattern, not
                  `.link-cta` (client, 2026-08-27: "the open in google maps
                  button should have the same animation as in view details
                  button in featured product cards") — replaced rather than
                  layered on top, since the two disagree on what the
                  underline should do at rest: `.link-cta` keeps one visible
                  always, turning green on hover; this keeps none visible
                  until hover, then sweeps one in from the left. Running both
                  on the same element would show two competing underline
                  behaviours. `inline-flex`, not `flex` — "View details" uses
                  `flex` because it is one of two items in a `justify-between`
                  row there; here the link sits alone in normal page flow, and
                  `inline-flex` is what sizes it to its own content instead of
                  stretching. A named group (`group/maps`) keeps this scoped
                  to itself regardless of what other `group`s exist elsewhere
                  on the page.

                  **The arrow uses `[transform:translateX(0.25rem)]`, not the
                  named `translate-x-1` "View details" itself uses** — found
                  while copying that pattern here: `translate-x-1` is silently
                  a no-op in this Tailwind version, confirmed directly on both
                  the original ("View details") and a fresh copy of this
                  exact class, `getComputedStyle(svg).transform` reading
                  `"none"` on hover either way. A fourth instance of the same
                  bracket-value gap already on record in `ui/Button` and
                  `product/ProductCard` for `scale-x-*` and `-translate-y-*`.
                  Fixed here because this line was being written anyway; the
                  original "View details" arrow was left as it is, same
                  scoping decision as the other three instances. */}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group/maps relative mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink transition-colors hover:text-accent"
              >
                <span className="relative">
                  Open in Google Maps
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-0.5 h-px origin-left bg-accent [transform:scaleX(0)] transition-transform duration-200 ease-out group-hover/maps:[transform:scaleX(1)]"
                  />
                </span>
                <ArrowRightIcon className="h-4 w-4 transition-transform duration-150 group-hover/maps:[transform:translateX(0.25rem)]" />
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
