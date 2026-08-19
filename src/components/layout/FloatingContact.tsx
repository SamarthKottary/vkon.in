import { PhoneIcon, WhatsAppIcon } from "@/components/icons/ui";
import { generalEnquiryMessage, telLink, whatsAppLink } from "@/lib/contact";
import { site } from "@/content/site";

/**
 * Floating call and WhatsApp buttons, bottom right, desktop only.
 *
 * These replace the phone number that sat in the header's top right. The header
 * retracts on the way down the page, which took the only way to call with it;
 * a fixed control does not go anywhere.
 *
 * **Desktop only, and that is not an oversight.** A phone already has
 * `MobileActionBar` — a full-width bar at the bottom — and two floating circles
 * on top of it would be four ways to do the same two things, covering content
 * on the smallest screen. The breakpoints are complementary: this is
 * `hidden md:flex`, that is `md:hidden`.
 *
 * **Bottom right** (client request, 2026-08-19). Note: this is where a chat
 * widget or cookie banner would land if either is ever added; put those on the
 * left so the two do not stack, or accept that they will.
 *
 * No WhatsApp brand green. `MobileActionBar` already made that call — a
 * saturated green button competes with the page and with the accent — so these
 * use the same band tokens and read as one family with it. Brand green is
 * available if you want it, but #25D366 carries a white glyph at only 1.98:1,
 * under the 3:1 that a meaningful icon needs; #1DA851 is the lightest WhatsApp
 * green that clears it.
 */
export function FloatingContact() {
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 hidden flex-col gap-3 md:flex">
      <FloatingButton
        href={whatsAppLink(generalEnquiryMessage)}
        label="Message us on WhatsApp"
        external
      >
        <WhatsAppIcon className="h-5 w-5" />
      </FloatingButton>

      <FloatingButton href={telLink()} label={`Call ${site.phone.display}`}>
        <PhoneIcon className="h-5 w-5" />
      </FloatingButton>
    </div>
  );
}

function FloatingButton({
  href,
  label,
  external = false,
  children,
}: {
  href: string;
  label: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      /* `pointer-events-auto` because the wrapper turns them off: the wrapper
         is a fixed full-height-of-its-content column, and without this it would
         swallow clicks on whatever sits beneath it between the two buttons. */
      className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-band-line bg-band text-band-ink shadow-card-hover transition-colors hover:border-band-accent hover:text-band-accent"
    >
      {children}
      <span className="sr-only">{label}</span>
    </a>
  );
}
