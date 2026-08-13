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

const socialLinks = [
  { label: "Facebook", href: site.socials.facebook, Icon: FacebookIcon },
  { label: "Instagram", href: site.socials.instagram, Icon: InstagramIcon },
  { label: "LinkedIn", href: site.socials.linkedin, Icon: LinkedInIcon },
  { label: "YouTube", href: site.socials.youtube, Icon: YouTubeIcon },
  { label: "X", href: site.socials.x, Icon: XIcon },
].filter((social) => social.href);

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
        <div className="grid gap-12 py-16 md:grid-cols-3 lg:grid-cols-4 lg:gap-8">
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

            {socialLinks.length > 0 && (
              <nav className="mt-8" aria-label="Social media">
                <p className="label-tech text-band-muted">Follow Vkon</p>
                <ul className="mt-4 flex items-center gap-2">
                  {socialLinks.map(({ label, href, Icon }) => (
                    <li key={label}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Follow Vkon on ${label}`}
                        className="flex h-9 w-9 items-center justify-center border border-band-line text-band-body transition-colors hover:border-band-accent hover:text-band-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-accent"
                      >
                        <Icon className="h-4 w-4" />
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
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

        <div className="flex flex-col gap-2 border-t border-band-line py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.legalName}
          </p>
          <p className="label-tech text-band-muted">
            Protection for Indian agriculture
          </p>
        </div>
      </Container>
    </footer>
  );
}
