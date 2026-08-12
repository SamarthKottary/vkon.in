import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons/ui";
import { HeroRotator } from "@/components/home/HeroRotator";
import { Container } from "@/components/ui/Container";
import { heroSegments } from "@/content/segments";
import { site } from "@/content/site";
import { telLink } from "@/lib/contact";

/**
 * Hero.
 *
 * Dark, full-bleed, left-aligned, with the headline given room and nothing
 * competing with it — the NVIDIA move, held to WAGO's restraint. No gradient
 * glows, no floating device mock, no centred text.
 *
 * The figures run along the bottom *inside* the rotator, so the photograph and
 * its scrim continue behind them. They were a separately ruled band until
 * 2026-08-12; over a picture those rules read as a wireframe laid on top, so
 * spacing separates the figures now.
 */

/* 1–40 HP is the range stated in the company's own product portfolio. It
   previously read 0.5–100, a placeholder written before that document existed.

   TODO(vkon): the 280–440 V band is unverified. It came from a competitor's
   poster during the first build and has never been confirmed against a Vkon
   panel. Check it or drop the figure. */
const FIGURES = [
  { value: "1–40", unit: "HP", label: "Motor range covered" },
  { value: "12", unit: "", label: "Protections built in" },
  { value: "3", unit: "phase", label: "Live amps & voltage" },
  { value: "280–440", unit: "V", label: "Input supply band" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-band">
      <div aria-hidden className="absolute inset-0 rule-grid opacity-70" />

      {/* The rotator owns the layout from here down, because its progress bar
          has to escape Container to reach both page edges. The calls to action
          and the figures are passed in as slots so they stay server-rendered —
          and so the buttons hold still while the message above them changes; a
          button that moves under the cursor every five seconds is one people
          misclick. */}
      <HeroRotator
        segments={heroSegments}
        footer={
          <Container size="wide">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-9 pb-14 pt-12 sm:grid-cols-4 sm:pb-16">
              {FIGURES.map((figure) => (
                <div key={figure.label}>
                  <dd className="font-mono text-2xl text-band-ink sm:text-3xl">
                    {figure.value}
                    {figure.unit && (
                      <span className="ml-1 text-base text-band-body">
                        {figure.unit}
                      </span>
                    )}
                  </dd>
                  <dt className="label-tech mt-2 text-band-body">
                    {figure.label}
                  </dt>
                </div>
              ))}
            </dl>
          </Container>
        }
      >
        <Link
          href="/protection"
          className="link-cta border-band-line text-band-ink hover:border-band-accent hover:text-band-accent"
        >
          Explore
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
        <a
          href={telLink()}
          className="text-sm text-band-muted transition-colors hover:text-band-ink"
        >
          Or call {site.phone.display}
        </a>
      </HeroRotator>
    </section>
  );
}
