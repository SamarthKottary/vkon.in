import Image from "next/image";
import { ArrowRightIcon } from "@/components/icons/ui";

export type SocialProfile = {
  key: string;
  /** Platform name, from `site.socials`. Printed as the heading above the
   *  card, so the platform is named in words and not left to an icon. */
  label: string;
  /** The real profile URL, from `site.socials`. */
  href: string;
  /** As shown under the display name. `null` where the URL carries no handle
   *  — the Facebook link is a `/share/` URL, not a page vanity URL. */
  handle: string | null;
  /** Brand colour, used for the cover wash and the heading mark. */
  color: string;
  Icon: (p: { className?: string }) => React.ReactElement;
};

/**
 * A profile *preview* — the platform's own chrome, filled with our own real
 * details — under a heading naming the platform, with one "View page" button.
 *
 * **Two shapes, one card** (client, 2026-08-24). Below `lg` it is horizontal
 * and the cards stack in rows down the page: avatar, name and button on one
 * line, which is the shape that suits a narrow screen. From `lg` it turns
 * vertical and the five sit in a single row. That is why nearly every size
 * here is a pair — the vertical column is only ~170px wide, so the card has to
 * be genuinely smaller in that mode, not merely rearranged.
 *
 * **The bio was dropped when the card shrank.** One sentence about the range
 * runs to eight lines in a 170px column. The platform heading, the URL and the
 * handle already say whose profile this is.
 *
 * **Read this before making it look more like a real screenshot.** The client
 * asked for "a screenshot of the actual profile being rendered on the
 * webpage". A live embed is what that describes, and it is not what this is,
 * for three reasons worth keeping written down:
 *
 * 1. Instagram and LinkedIn have no profile embed at all. Instagram embeds
 *    single *posts*; a profile feed needs the Graph API, which means a Meta
 *    app, a token that expires every 60 days and a refresh job. LinkedIn
 *    offers nothing.
 * 2. Facebook's Page Plugin and X's timeline widget do exist, but both are
 *    third-party scripts that set cookies the moment the page loads, for every
 *    visitor, whether or not they ever look at the card. §9 forbids exactly
 *    that. The Google Maps embed on /contact is the one standing exception and
 *    it was an explicit client decision.
 * 3. The accounts had no posts when this was written, so a real feed would
 *    render an empty box on the busiest page of the site.
 *
 * **Nothing here is invented.** The URL in the chrome bar, the display name,
 * the handle and the destination are all real. There are deliberately no
 * follower or post counts — those would have to be made up. A grid of tiles
 * stood in for posts until 2026-08-24 and the client had it removed for
 * exactly that reason: photographs arranged as a post grid read as posts, and
 * they were not.
 *
 * **The card is not itself a link.** One "View page" button carries the whole
 * destination. An earlier build made the entire card an anchor, which cannot
 * hold a button inside it — nested interactive elements are invalid and give
 * the same destination two tab stops.
 */

/**
 * WCAG relative-luminance contrast, `black` (`--color-band`) or `white`
 * against a given brand hex — whichever clears more of the 4.5:1 bar.
 *
 * Exists because the "View page" button's hover fill is `profile.color`
 * itself (client, 2026-08-27: "view page button should have its respective
 * colour... when cursor is hovered over it, it should have the loading
 * animation... in their respective colours"), and no single fixed hover-text
 * colour clears AA against all five brand colours at once: by this same
 * formula, white passes against X's black (`#000000`, obviously) and
 * LinkedIn's blue (`#0A66C2`, 5.7:1) but fails against Instagram's pink
 * (4.3:1), Facebook's blue (4.2:1) and YouTube's red (4.0:1) — while black
 * passes those three (4.8–5.3:1) but is invisible on X's black and fails
 * LinkedIn's blue (3.7:1). Computed once per card from `profile.color`
 * rather than hand-picked per platform, so a sixth platform added later gets
 * a correct answer automatically instead of silently inheriting whichever
 * fixed colour happened to be already in use.
 */
function contrastTextColor(hex: string): "black" | "white" {
  const channels = hex.match(/[0-9a-f]{2}/gi) ?? ["00", "00", "00"];
  const linear = (channel: string) => {
    const c = parseInt(channel, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * linear(channels[0]) + 0.7152 * linear(channels[1]) + 0.0722 * linear(channels[2]);
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  return contrastWithWhite >= contrastWithBlack ? "white" : "black";
}

export function SocialProfileCard({ profile }: { profile: SocialProfile }) {
  const { Icon } = profile;
  /* `dark:hover:`/`dark:focus-visible:`, not just `hover:`/`focus-visible:`
     — found by testing dark mode specifically, not assumed: a plain
     `hover:text-band` loses to `dark:text-band-ink` (the resting dark-mode
     colour, below) when both match at once, i.e. hovering while the site is
     in dark mode. Confirmed directly — Facebook's button, dark mode, hover:
     text stayed the resting near-white instead of switching to black, which
     is the one combination that actually needs to change (`dark:text-band-ink`
     is white text for the black *resting* fill; the fill this is layered
     over during hover is `profile.color`, not black, so the right hover
     colour is independent of what dark mode's resting colour happens to be).
     The compound variant is unambiguous rather than relying on cascade order
     between two simple ones. */
  const hoverTextClass =
    contrastTextColor(profile.color) === "white"
      ? "hover:text-white focus-visible:text-white dark:hover:text-white dark:focus-visible:text-white"
      : "hover:text-band focus-visible:text-band dark:hover:text-band dark:focus-visible:text-band";

  return (
    <div
      style={{ "--brand": profile.color } as React.CSSProperties}
      /* `group`, not a second `:hover` zone — the platform name sits *above*
         the card in DOM order, so a card-only `:hover` can never reach it
         (sibling combinators only select forward). Making this wrapper the
         hover boundary instead means either the name or the card triggers
         both (client, 2026-08-27: "the box pop up to include name of the
         social media above it as well"). */
      className="group flex h-full flex-col"
    >
      {/* The platform, named above the card (client) rather than left to the
          glyph in the chrome bar.

          Its own pop, distinct from the card's (client, same message: "the
          name should pop up separately, the animation design is left to
          you") — a scale rather than the card's lift, so the two read as two
          things reacting together rather than one element dragging the
          other. `transform-origin` defaults to centre, which is fine here:
          the row has no siblings crowding it and scale does not consume
          layout space the way a translate would, so there is nothing for an
          8% grow to collide with. Arbitrary-property transform for the same
          reason as the card below — named scale utilities are unverified in
          this Tailwind version and arbitrary values need brackets regardless
          for a non-standard multiplier like 1.08.

          `justify-center` (client, 2026-08-27: "bring the social media names
          to the centre") — the row is full width (it spans the same column
          as the card below it), so centring is `justify-content`, not a
          text-align: the icon travels with the name as one centred unit
          rather than each being centred independently. */}
      <div className="flex items-center justify-center gap-2 transition-transform duration-200 ease-out group-hover:[transform:scale(1.08)]">
        <Icon className="h-4 w-4 shrink-0 text-[var(--brand)]" />
        <h3 className="truncate text-[0.9375rem] font-medium tracking-tight text-ink">
          {profile.label}
        </h3>
      </div>

      {/* Pop on hover (client, 2026-08-24) — lift and a stronger shadow, not a
          scale: the vertical (`lg`) layout packs five of these in one row
          with a 12px gap, and this card is already only ~170px wide there,
          so scaling up risked the lifted card visibly overlapping its
          neighbours. A lift reads as "picked up" without that risk. Triggered
          by `group-hover` rather than the card's own `:hover` (client,
          2026-08-27, see above) — hovering the name above now pops the card
          too, not only hovering the card itself, which still works the same
          way since hovering it is hovering inside the group.

          `[transform:translateY(-0.25rem)]`, not `-translate-y-1` — confirmed
          by testing that the named translate utilities are silent no-ops in
          this Tailwind version (see the note on `ui/Button`'s `sweepClasses`,
          found while building the button-sweep animation right after this
          card). Arbitrary-property syntax sidesteps whichever utility names
          this version does or doesn't ship.

          Brand-coloured border, replacing the neutral `border-line`/
          `border-line-strong` pair (client, same message: "the box... should
          have its respective colour as boundary, also when pop up that
          colour should increase") — `/35` at rest, full strength on hover,
          so "increase" is literal: the same colour, more of it, not a
          second colour swapped in. Width stays a constant `border-2` in both
          states rather than also thickening on hover — changing
          `border-width` reflows the box a pixel each way, and the opacity
          jump alone already reads clearly as "more". `border-color` was
          already in this element's transitioned property list, so the new
          colour animates smoothly for free. */}
      <div className="mt-2 flex h-full flex-col overflow-hidden border-2 border-[var(--brand)]/35 bg-surface-raised transition-[transform,box-shadow,border-color] duration-200 group-hover:[transform:translateY(-0.25rem)] group-hover:border-[var(--brand)] group-hover:shadow-card-hover">
        {/* Chrome bar. Showing the real URL is what makes the card read as a
            window onto a profile rather than as another styled link — and it
            tells the visitor where the button goes before they press it.

            `min-w-0` is load-bearing, not tidiness: a flex item defaults to
            `min-width: auto` and refuses to shrink below its content, so
            `truncate` never engages and the longest URL pushes the card wide.
            In the `lg` column it truncates to about the domain, which is
            still the part that identifies the destination. */}
        <div className="flex items-center border-b border-line bg-surface-subtle px-3 py-2">
          <span className="min-w-0 truncate font-mono text-[0.6875rem] text-muted">
            {profile.href.replace(/^https:\/\/(www\.)?/, "")}
          </span>
        </div>

        {/* Cover band, washed with the brand colour. `/12` rather than the
            full colour: five saturated bands would shout, and the wash still
            identifies the platform at a glance. */}
        <div className="h-12 shrink-0 bg-[var(--brand)]/12" />

        {/* Horizontal below `lg`, vertical from it. `items-end` keeps the
            button on the baseline of the block beside it in the horizontal
            form; the vertical form pushes it to the bottom with `mt-auto` so
            the five buttons line up across the row however the names wrap. */}
        <div className="-mt-6 flex h-full flex-wrap items-end gap-x-4 gap-y-3 px-3 pb-3 lg:flex-col lg:flex-nowrap lg:items-stretch">
          <div className="min-w-0">
            {/* The ring is `border-surface-raised`, matching the card, so the
                avatar reads as sitting on the cover the way a real profile
                picture does. */}
            <Image
              src="/brand/vkon-avatar.png"
              alt=""
              width={56}
              height={56}
              className="h-12 w-12 rounded-full border-[3px] border-surface-raised bg-surface-raised object-cover"
            />
            <p className="mt-2 truncate text-sm font-medium leading-tight text-ink">
              Vkon Automation
            </p>
            <p className="truncate font-mono text-[0.6875rem] text-muted">
              {profile.handle ?? "Kolar Gold Fields"}
            </p>
          </div>

          {/* Bespoke `<a>`, not `ui/Button` (client, 2026-08-27: "view page
              button should have its respective colour and when cursor is
              hovered over it, it should have the loading animation like in
              the explore our products and download our brochure button in
              thier respective colours" — a per-platform sweep colour, which
              `ui/Button`'s `sweep` prop cannot express since its fill is
              hard-coded to `bg-accent`, one colour for every button that
              uses it). Same reasoning as `SubscribePanel`'s button: reproduce
              the sweep locally rather than fight a shared component's fixed
              opinions. `href` is always a bare `https://` URL here, never an
              internal path, so there is no routing logic to replicate from
              `ui/Button` — a plain anchor is the whole of what it was doing
              for this case.

              Resting colour, `border-band`/`text-band` (black) in light
              mode, `dark:border-band-ink`/`dark:text-band-ink` (white) in
              dark mode (client, same message: "make the view our page
              button white in dark mode and black in light mode") — same
              literal black/white pairing as `SubscribePanel`'s button,
              reusing those tokens for consistency rather than Tailwind's
              plain `black`/`white`. Sweep fill is `before:bg-[var(--brand)]`
              — the platform's own colour, matching the card's border. Hover
              text colour is `hoverTextClass`, computed once above by
              `contrastTextColor` rather than fixed, because no single
              black-or-white choice is legible against all five brand
              colours (see that function's comment for the numbers) — border
              colour is left unchanged on hover since the fill sweep is
              already the dominant signal, matching the resting choice
              rather than also chasing the brand colour the way the card's
              own border does. */}
          <a
            href={profile.href}
            target="_blank"
            /* `noreferrer` alongside `noopener`, as in `Footer` — the platform
               is not told which page the visitor came from. */
            rel="noopener noreferrer"
            /* The visible label is the same on all five cards, so the
               accessible name says which page it opens. */
            aria-label={`View our ${profile.label} page`}
            className={`relative isolate ml-auto inline-flex h-8 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-sm border border-band px-3 text-[0.8125rem] font-medium whitespace-nowrap text-band transition-colors before:absolute before:inset-0 before:-z-10 before:origin-left before:[transform:scaleX(0)] before:bg-[var(--brand)] before:transition-transform before:duration-700 before:ease-out before:content-[''] hover:before:[transform:scaleX(1)] focus-visible:before:[transform:scaleX(1)] dark:border-band-ink dark:text-band-ink lg:ml-0 lg:mt-auto lg:w-full ${hoverTextClass}`}
          >
            View page
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
