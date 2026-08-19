import { ContactStrip } from "@/components/home/ContactStrip";
import { SubscribePanel } from "@/components/layout/SubscribePanel";
import { PageHero } from "@/components/layout/PageHero";
import { Container } from "@/components/ui/Container";
import { site } from "@/content/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "About",
  description: `${site.legalName} builds electronic motor starters and control panels for agricultural pumps, designed around the supply conditions Indian borewells actually run on.`,
  path: "/about",
});

/**
 * TODO(vkon): the copy below describes the product and the trade rather than
 * inventing company history. Founding story, factory, team size and units in
 * the field are yours to supply and will outperform any of this.
 */
const principles = [
  {
    n: "01",
    title: "Specified for the supply we actually have",
    body: "Rural three-phase swings, drops a phase, and comes back reversed after line work. Our panels are rated for a 280–440 V input band because that is the reality of the feeder, not the ideal on a datasheet.",
  },
  {
    n: "02",
    title: "CT-based sensing, not thermal guesswork",
    body: "Current transformers measure the real load on each phase, so the trip point is a number you set from the keypad rather than a bimetal strip's opinion. That is what makes overload protection repeatable.",
  },
  {
    n: "03",
    title: "Built to restart, not only to trip",
    body: "A panel that trips and stays tripped costs a farmer a night of irrigation. Auto restart on dry run and on voltage recovery means the pump comes back on its own once conditions allow.",
  },
  {
    n: "04",
    title: "Serviceable where it is installed",
    body: "A control panel that cannot be repaired locally is one that gets bypassed the first time it trips. We sell through dealers who stock the spares and know the equipment.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow={`About ${site.name}`}
        title="We build the thing that stands between your motor and the mains."
        description="Electronic starters and control panels for agricultural pumps — single phase through star-delta, solar through GSM mobile control."
        breadcrumb={[{ label: "Home", href: "/" }]}
      />

      <section className="py-14 sm:py-20">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <h2 className="label-tech pt-2 text-muted">The problem</h2>
            <div className="max-w-2xl space-y-6 text-[1.0625rem] leading-relaxed text-body">
              {/* TODO(vkon): replace with the real company story. */}
              <p>
                A submersible pump is the most expensive thing on most farms that
                nobody thinks about until it fails. It sits hundreds of feet
                down, runs on a supply no urban appliance would tolerate, and
                when the winding goes the cost is not just the rewind — it is the
                weeks of irrigation lost while the borewell sits idle.
              </p>
              <p>
                {site.legalName} exists for that problem. Every panel we make is
                built around one question: what is about to damage this motor,
                and can we see it coming in time to cut the supply? The display,
                the timers, the mobile control — all of it follows from that.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-line">
        <Container size="wide">
          <ul className="grid md:grid-cols-2">
            {principles.map((principle, index) => (
              <li
                key={principle.n}
                className={`border-line py-10 md:py-12 ${
                  index % 2 === 0 ? "md:pr-12" : "md:border-l md:pl-12"
                } ${index < principles.length - (principles.length % 2 === 0 ? 2 : 1) ? "border-b" : "border-b md:border-b-0"}`}
              >
                <p className="label-tech text-accent">{principle.n}</p>
                <h3 className="mt-4 text-xl leading-snug">{principle.title}</h3>
                <p className="mt-3 max-w-md leading-relaxed text-muted">
                  {principle.body}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="border-t border-line bg-band py-16 sm:py-20">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
            <h2 className="label-tech pt-2 text-band-muted">Service</h2>
            <div className="max-w-2xl space-y-6 text-[1.0625rem] leading-relaxed text-band-body">
              {/* TODO(vkon): replace with real warranty terms and turnaround. */}
              <p className="text-2xl leading-snug text-band-ink sm:text-3xl">
                Service is part of the product, not an afterthought.
              </p>
              <p>
                If a unit needs attention the fastest route is a phone call, not
                a support ticket. The number in the footer reaches someone who
                can actually help — and who knows what the panel does.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <SubscribePanel />

      <ContactStrip
        heading="Talk to us about your installation"
        body="Motor rating, supply type, borewell depth. That is usually all we need to point you at the right panel."
      />
    </>
  );
}
