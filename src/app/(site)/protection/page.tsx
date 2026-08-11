import Link from "next/link";
import { ContactStrip } from "@/components/home/ContactStrip";
import { ProtectionIcon, protectionMeta } from "@/components/icons/protections";
import { ArrowRightIcon } from "@/components/icons/ui";
import { PageHero } from "@/components/layout/PageHero";
import { Container } from "@/components/ui/Container";
import { PROTECTION_KEYS } from "@/content/taxonomy";
import { site } from "@/content/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Protection",
  description:
    "What actually destroys an agricultural pump motor — dry running, single phasing, phase reversal, voltage outside the safe band, overload — and what a Vkon panel does about each one.",
  path: "/protection",
});

/**
 * One protection page for the whole range, not one per market segment.
 *
 * The failure modes are properties of Indian mains supply and of induction
 * motors, so they are identical whether the motor sits on a borewell, a rooftop
 * tank or a solar array. Three near-identical pages would split the search
 * signal for the same queries and triple the maintenance for text that barely
 * differs. If a segment ever needs its own angle, add a section here rather
 * than a page.
 */
export default function ProtectionPage() {
  return (
    <>
      <PageHero
        eyebrow="Protection delivered"
        title="What takes a motor out"
        description="Rural supply is not kind to pumps. These are the conditions a Vkon panel watches for, continuously, on all three phases — and what it does when it finds one."
        breadcrumb={[{ label: "Home", href: "/" }]}
      />

      <section className="py-16 sm:py-20 lg:py-24">
        <Container size="wide">
          <ul className="grid gap-x-10 border-t border-line sm:grid-cols-2 lg:grid-cols-3">
            {PROTECTION_KEYS.map((key) => (
              <li key={key} className="flex gap-4 border-b border-line py-6">
                <ProtectionIcon
                  name={key}
                  className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                />
                <div>
                  <h2 className="text-[0.9375rem] font-medium text-ink">
                    {protectionMeta[key].label}
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {protectionMeta[key].description}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-10 max-w-2xl text-body">
            Not every panel carries every protection — the set depends on the
            starting method and the rating. Each product page lists exactly what
            that unit watches for.
          </p>

          <Link href="/products" className="link-cta mt-8">
            See the range
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </Container>
      </section>

      <ContactStrip
        heading="Not sure which protections you need?"
        body={`Tell us the pump rating and what your supply does, and we will tell you which panel covers it. ${site.hours}.`}
      />
    </>
  );
}
