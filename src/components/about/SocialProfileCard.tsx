import Image from "next/image";
import { ArrowRightIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";

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
export function SocialProfileCard({ profile }: { profile: SocialProfile }) {
  const { Icon } = profile;

  return (
    <div
      style={{ "--brand": profile.color } as React.CSSProperties}
      className="flex h-full flex-col"
    >
      {/* The platform, named above the card (client) rather than left to the
          glyph in the chrome bar. */}
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-[var(--brand)]" />
        <h3 className="truncate text-[0.9375rem] font-medium tracking-tight text-ink">
          {profile.label}
        </h3>
      </div>

      <div className="mt-2 flex h-full flex-col overflow-hidden border border-line bg-surface-raised transition-shadow duration-200 hover:shadow-card">
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

          <Button
            href={profile.href}
            target="_blank"
            /* `noreferrer` alongside `noopener`, as in `Footer` — the platform
               is not told which page the visitor came from. */
            rel="noopener noreferrer"
            variant="outline"
            size="sm"
            /* The visible label is the same on all five cards, so the
               accessible name says which page it opens. */
            aria-label={`View our ${profile.label} page`}
            className="ml-auto lg:ml-0 lg:mt-auto lg:w-full"
          >
            View page
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
