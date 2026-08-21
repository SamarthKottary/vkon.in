import Link from "next/link";
import { ContactStrip } from "@/components/home/ContactStrip";
import { ProtectionIcon, protectionMeta } from "@/components/icons/protections";
import { ArrowRightIcon } from "@/components/icons/ui";
import { PageHero } from "@/components/layout/PageHero";
import { Container } from "@/components/ui/Container";
import { protectionGroups } from "@/content/taxonomy";
import { resolvePageMetadata } from "@/lib/db/pageSeo";
import type { ProtectionKey } from "@/lib/types";

export async function generateMetadata() {
  return resolvePageMetadata({
    title: "Protection",
    description:
      "What actually destroys an agricultural pump motor — dry running, single phasing, phase reversal, voltage outside the safe band, overload — and what a Vkon panel does about each one.",
    path: "/protection",
  });
}

/**
 * One protection page for the whole range, not one per market segment.
 *
 * The failure modes are properties of Indian mains supply and of induction
 * motors, so they are identical whether the motor sits on a borewell, a rooftop
 * tank or a solar array. Per-segment pages would compete for the same queries
 * and triple the maintenance of text that barely differs. If a segment needs
 * its own angle, add a section here rather than a page.
 *
 * The twelve are grouped rather than listed flat — see `protectionGroups`. The
 * first group is set on a dark band because it is the part that matters: those
 * six are why the panel exists. The remaining two read as ordinary sections.
 */
export default function ProtectionPage() {
  const [faults, ...rest] = protectionGroups;

  return (
    <>
      <PageHero
        eyebrow="Protection delivered"
        title="What takes a motor out"
        description="Rural supply is not kind to pumps. A burnt winding is a rewind, a week without irrigation, and a bill nobody planned for — and almost none of it is the pump's fault."
        breadcrumb={[{ label: "Home", href: "/" }]}
      />

      <section className="bg-band py-16 sm:py-20 lg:py-24">
        <Container size="wide">
          <div className="max-w-2xl">
            <p className="label-tech text-band-accent">{faults.eyebrow}</p>
            <h2 className="mt-4 text-[1.75rem] leading-[1.15] text-band-ink sm:text-4xl">
              {faults.title}
            </h2>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-band-muted">
              {faults.intro}
            </p>
          </div>

          <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {faults.keys.map((key) => (
              <ProtectionItem key={key} name={key} tone="dark" />
            ))}
          </ul>
        </Container>
      </section>

      {rest.map((group, index) => (
        <section
          key={group.key}
          /* Alternating tone. Three consecutive light sections separated only by
             a hairline read as one continuous white sheet. */
          className={`border-t border-line py-16 sm:py-20 lg:py-24 ${
            index % 2 === 0 ? "bg-surface-subtle" : "bg-surface"
          }`}
        >
          <Container size="wide">
            <div className="max-w-2xl">
              <p className="label-tech text-accent">{group.eyebrow}</p>
              <h2 className="mt-4 text-[1.75rem] leading-[1.15] sm:text-4xl">
                {group.title}
              </h2>
              <p className="mt-5 text-[1.0625rem] leading-relaxed text-body">
                {group.intro}
              </p>
            </div>

            <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {group.keys.map((key) => (
                <ProtectionItem key={key} name={key} tone="light" />
              ))}
            </ul>
          </Container>
        </section>
      ))}

      <section className="border-t border-line py-16 sm:py-20">
        <Container size="wide">
          <div className="max-w-2xl border-l-2 border-accent pl-6">
            <h2 className="text-xl leading-snug sm:text-2xl">
              Which panel has which
            </h2>
            <p className="mt-4 text-body">
              Not every panel carries every protection — the set depends on the
              starting method and the rating. Each product page lists exactly
              what that unit watches for.
            </p>
            <Link href="/products" className="link-cta mt-8">
              See the range
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </Container>
      </section>

      <ContactStrip
        heading="Not sure which protections you need?"
        body="Tell us the pump rating and what your supply does, and we will tell you which panel covers it."
      />
    </>
  );
}

/**
 * Icon stacked above the label rather than beside it. Inline, the icon reads as
 * a bullet and the description wraps into a narrow column; stacked, each entry
 * gets the full cell width and the grid reads as a set of specifications.
 */
function ProtectionItem({
  name,
  tone,
}: {
  name: ProtectionKey;
  tone: "dark" | "light";
}) {
  const dark = tone === "dark";
  const meta = protectionMeta[name];

  return (
    <li
      className={
        dark
          ? "border border-band-line bg-band-raised p-6"
          : "border border-line bg-surface-raised p-6 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
      }
    >
      <span
        className={`flex h-10 w-10 items-center justify-center border ${
          dark
            ? "border-band-line bg-band text-band-accent"
            : "border-line bg-surface-subtle text-accent"
        }`}
      >
        <ProtectionIcon name={name} className="h-5 w-5" />
      </span>
      <h3
        className={`mt-5 text-base font-medium ${dark ? "text-band-ink" : "text-ink"}`}
      >
        {meta.label}
      </h3>
      <p
        className={`mt-2 text-sm leading-relaxed ${dark ? "text-band-body" : "text-muted"}`}
      >
        {meta.description}
      </p>
    </li>
  );
}
