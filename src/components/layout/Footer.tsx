import Link from "next/link";
import { Logo } from "@/components/icons/Logo";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  XIcon,
  YouTubeIcon,
} from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { footerNav } from "@/content/nav";
import { formattedAddress, site } from "@/content/site";
import { mailtoLink, telLink, whatsAppLink, generalEnquiryMessage } from "@/lib/contact";

/**
 * Contact lives here now that there is no dedicated contact page. The address
 * block is the first column on desktop so it is not buried under link lists.
 *
 * `pb-24 md:pb-0` clears the fixed mobile action bar at the end of the document.
 */
export function Footer() {
  return (
    <footer className="border-t border-band-line bg-band pb-24 text-band-muted md:pb-0">
      <Container size="wide">
        {/* Five columns at lg, not four: the address block spans two and there
            are three link lists after it. At four the last list dropped onto a
            second row on its own, under the address, reading as part of it. */}
        <div className="grid gap-12 py-16 md:grid-cols-3 lg:grid-cols-5 lg:gap-8">
          {/* Full row at tablet. At md:grid-cols-3 this column was a third of
              the width, which left ~160px for an email address needing 214 —
              it wrapped mid-word between 768 and 1023px only. */}
          <div className="md:col-span-3 lg:col-span-2">
            <Logo tone="light" />

            <address className="mt-8 not-italic">
              <p className="label-tech text-band-muted">Head office</p>
              <p className="mt-3 max-w-xs leading-relaxed text-band-body">
                {formattedAddress}
              </p>
            </address>

            <dl className="mt-8 space-y-3 text-sm">
              <div className="flex gap-4">
                <dt className="label-tech w-20 shrink-0 pt-1 text-band-muted">
                  Phone
                </dt>
                <dd>
                  <a
                    href={telLink()}
                    className="text-band-body hover:text-band-ink"
                  >
                    {site.phone.display}
                  </a>
                </dd>
              </div>
              <div className="flex gap-4">
                <dt className="label-tech w-20 shrink-0 pt-1 text-band-muted">
                  Email
                </dt>
                <dd>
                  <a
                    href={mailtoLink()}
                    className="break-all text-band-body hover:text-band-ink"
                  >
                    {site.email}
                  </a>
                </dd>
              </div>
              <div className="flex gap-4">
                <dt className="label-tech w-20 shrink-0 pt-1 text-band-muted">
                  WhatsApp
                </dt>
                <dd>
                  <a
                    href={whatsAppLink(generalEnquiryMessage)}
                    className="text-band-body hover:text-band-ink"
                  >
                    Message us
                  </a>
                </dd>
              </div>
              <div className="flex gap-4">
                <dt className="label-tech w-20 shrink-0 pt-1 text-band-muted">
                  Hours
                </dt>
                <dd className="text-band-body">{site.hours}</dd>
              </div>
            </dl>
          </div>

          {footerNav.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <h2 className="label-tech text-band-muted">{group.heading}</h2>
              <ul className="mt-5 space-y-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-band-body hover:text-band-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* The social row lives on the bottom bar, not in the Company column.
            At `lg:grid-cols-5` that column is ~230px and five 40px targets plus
            their gaps need 240 — they wrapped 4-then-1, which looks like a
            mistake. The bottom bar has the full width and puts them opposite
            the copyright, which is where a visitor looks for them anyway. */}
        <div className="flex flex-col gap-6 border-t border-band-line py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5 text-xs sm:flex-row sm:items-center sm:gap-3">
            <p>
              © {new Date().getFullYear()} {site.legalName}
            </p>
            {/* `band-muted`, not `band-line`. The line token is for 1px rules
                and sits at 1.5:1 — as a glyph it is invisible, which makes it a
                separator that separates nothing. */}
            <span aria-hidden className="hidden text-band-muted sm:inline">
              ·
            </span>
            <p className="label-tech text-band-muted">
              Protection for Indian agriculture
            </p>
          </div>

          <SocialLinks />
        </div>
      </Container>
    </footer>
  );
}

/** Icon per `site.socials.key`. An unknown key renders nothing. */
const SOCIAL_ICONS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  x: XIcon,
  youtube: YouTubeIcon,
  linkedin: LinkedInIcon,
};

/**
 * Profile links, as a row of circular buttons.
 *
 * Each carries a visible-text-equivalent accessible name ("Vkon on YouTube")
 * rather than a bare icon, and `rel="noreferrer"` alongside `noopener` so the
 * destination is not told which page the visitor came from.
 *
 * `h-10 w-10` is the floor for a touch target, not a look — at the 20px icon
 * size these want to be, the tap area would otherwise be half what a thumb
 * needs.
 */
function SocialLinks() {
  /* No emptiness guard: `site` is `as const`, so TypeScript types
     `socials.length` as the literal 5 and rejects a comparison against 0 as
     unreachable. Emptying the array makes the map render nothing, and the
     wrapper collapses to zero height, which is the same outcome. */
  return (
    <ul className="flex flex-wrap items-center gap-2.5">
      {site.socials.map((social) => {
        const Icon = SOCIAL_ICONS[social.key];
        if (!Icon) return null;

        return (
          <li key={social.key}>
            <a
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-band-line text-band-body transition-colors hover:border-band-accent hover:text-band-ink"
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="sr-only">{`Vkon on ${social.label}`}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
