import { ArrowDownIcon } from "@/components/icons/ui";
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
 * glows, no floating device mock, no centred text. The figures sit on a ruled
 * strip along the bottom, which is where an industrial site puts its numbers.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-band">
      <div aria-hidden className="absolute inset-0 rule-grid opacity-70" />

      <Container size="wide" className="relative">
        <div className="max-w-4xl py-20 sm:py-28 lg:py-36">
          <HeroRotator segments={heroSegments} />

          {/* The calls to action sit outside the rotator so they hold still
              while the message above them changes — a button that moves under
              the cursor every five seconds is a button people misclick. */}
          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
            <a
              href="#protection"
              className="link-cta border-band-line text-band-ink hover:border-band-accent hover:text-band-accent"
            >
              Explore
              <ArrowDownIcon className="h-4 w-4" />
            </a>
            <a
              href={telLink()}
              className="text-sm text-band-muted transition-colors hover:text-band-ink"
            >
              Or call {site.phone.display}
            </a>
          </div>
        </div>
      </Container>

      <div className="relative border-t border-band-line">
        <Container size="wide">
          {/* 2×2 on mobile, 1×4 on desktop. Dividers are set per item rather
              than with `divide-x`, which would put a left border on the item
              that starts the second row on mobile. */}
          <dl className="grid grid-cols-2 sm:grid-cols-4">
            {[
              /* 1–40 HP is the range stated in the company's own product
                 portfolio. It previously read 0.5–100, which was a placeholder
                 written before that document existed. */
              { value: "1–40", unit: "HP", label: "Motor range covered" },
              { value: "12", unit: "", label: "Protections built in" },
              { value: "3", unit: "phase", label: "Live amps & voltage" },
              /* TODO(vkon): unverified. This band came from a competitor's
                 poster during the first build and has never been confirmed
                 against a Vkon panel. Check it or remove the stat. */
              { value: "280–440", unit: "V", label: "Input supply band" },
            ].map((stat, index) => (
              <div
                key={stat.label}
                className={`border-band-line py-7 sm:border-b-0 sm:py-8 ${
                  index % 2 === 1 ? "border-l pl-5" : ""
                } ${index < 2 ? "border-b" : ""} ${
                  index > 0 ? "sm:border-l sm:pl-6" : ""
                }`}
              >
                <dd className="font-mono text-2xl text-band-ink sm:text-3xl">
                  {stat.value}
                  {stat.unit && (
                    <span className="ml-1 text-base text-band-muted">
                      {stat.unit}
                    </span>
                  )}
                </dd>
                <dt className="label-tech mt-2 text-band-muted">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </Container>
      </div>
    </section>
  );
}
