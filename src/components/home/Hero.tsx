import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons/ui";
import { HeroRotator } from "@/components/home/HeroRotator";
import { Container } from "@/components/ui/Container";
import { heroSegments } from "@/content/segments";

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

/**
 * **One screenful, derived — never a fixed height guessed against one machine.**
 *
 * The section's `min-h` is `100svh` less the two things permanently parked over
 * the viewport: the header (`layout/Header`, an explicit `h-16` plus its 1px
 * bottom border = 65px at every width, so `4rem + 1px` is exact rather than
 * measured) and, below `md`, `layout/MobileActionBar` (`fixed bottom-0`,
 * 3.5rem).
 *
 * This replaced a run of hand-tuned padding figures that tried to land the hero
 * inside "a desktop". They could not: a laptop's usable browser height is its
 * screen height less whatever tab strip, address bar and bookmarks bar it
 * happens to show, which no constant in this repo can know (client: "Can we not
 * solve it for every device rather than just guessing and fitting at a fixed
 * height"). Asking the viewport is the only thing that answers for every device
 * at once.
 *
 * `min-h`, not `h`: where the content is taller than one screen — every phone,
 * since the headline wraps to four or five lines — the hero grows past it and
 * the curtain offset in `app/(site)/page.tsx` takes over, the behaviour that
 * was already there. Where the content is shorter, which is every desktop, the
 * box fills exactly one screen and the padding below stops deciding anything.
 *
 * `flex flex-col` so `HeroRotator` can stretch into that height: the photograph
 * is `absolute inset-0` inside it, so the image is as tall as this box — which
 * is what stops it reading as a short band on a big monitor — and the figures
 * dock to the bottom edge of the screen instead of wherever the padding
 * happened to end.
 */
export function Hero() {
  return (
    <section className="relative flex min-h-[calc(100svh_-_4rem_-_1px_-_3.5rem)] flex-col overflow-hidden bg-band md:min-h-[calc(100svh_-_4rem_-_1px)]">
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
            {/* The bottom padding is the gap between the last label and the
                bottom edge of the screen, now that the hero is exactly one
                screenful — so it scales with the screen rather than sitting at
                one number that is generous on a monitor and crowding on a
                laptop. `max()` holds the old 12px as a floor, so a short
                viewport pays nothing for this and the hero's minimum height is
                unchanged. */}
            <dl className="grid grid-cols-2 gap-x-8 gap-y-8 pb-7 pt-12 sm:grid-cols-4 sm:pb-8 sm:pt-14 lg:gap-y-3 lg:pb-[max(0.75rem,2.5svh)] lg:pt-3">
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
        {/* `.link-cta` (a bordered, always-underlined pill) replaced with
            `product/ProductCard`'s "View details" pattern (client,
            2026-08-27: "Make it have the same animation as in view details
            in featured product cards") — no visible boundary at rest, an
            underline that sweeps in from the left on hover, `band-accent`
            in place of `accent` since this sits on the hero's photograph
            rather than an ordinary page surface, same substitution this
            pattern already gets everywhere else it's been copied onto band
            content. No `text-sm`, unlike the source: that class carries the
            product card's own small type scale, and shrinking the hero's
            one primary CTA to match a card's secondary link was never part
            of the ask — only the hover behaviour was. Arrow uses
            `[transform:translateX(0.25rem)]`, the established arbitrary-
            property fix for this Tailwind version's `translate-x-1` gap,
            since this is new code rather than the original instance in
            `ProductCard` that stays unfixed by this project's own scoping
            convention. */}
        <Link
          href="/protection"
          className="group/explore relative inline-flex items-center gap-1.5 font-medium text-band-ink transition-colors hover:text-band-accent"
        >
          <span className="relative">
            Explore
            <span
              aria-hidden
              className="absolute inset-x-0 -bottom-0.5 h-px origin-left bg-band-accent [transform:scaleX(0)] transition-transform duration-200 ease-out group-hover/explore:[transform:scaleX(1)]"
            />
          </span>
          <ArrowRightIcon className="h-4 w-4 transition-transform duration-150 group-hover/explore:[transform:translateX(0.25rem)]" />
        </Link>
      </HeroRotator>
    </section>
  );
}
