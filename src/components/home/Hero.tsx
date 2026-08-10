import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
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
          {/* TODO(vkon): add "Since <year>" here once the real founding year is
              confirmed. It previously read 1999, which was the competitor's
              founding year taken off their poster — false, and too close to
              their brand claim. */}
          <p className="label-tech text-band-accent">Made in India</p>

          <h1 className="mt-6 text-[2.5rem] leading-[1.05] text-band-ink sm:text-6xl lg:text-7xl">
            Protection between
            <br />
            your motor and
            <br />
            <span className="text-band-muted">the mains.</span>
          </h1>

          <p className="mt-8 max-w-xl text-lg leading-relaxed text-band-muted">
            Electronic starters and control panels for agricultural pumps. Built
            for the supply Indian borewells actually run on — 280 to 440 volts,
            phases that drop out, and water that runs dry without warning.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link
              href="/products"
              className="link-cta border-band-line text-band-ink hover:border-band-accent hover:text-band-accent"
            >
              View the range
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
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
              { value: "0.5–100", unit: "HP", label: "Motor range covered" },
              { value: "12", unit: "", label: "Protections built in" },
              { value: "3", unit: "phase", label: "Live amps & voltage" },
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
