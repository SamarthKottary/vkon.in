import { PhoneIcon, WhatsAppIcon } from "@/components/icons/ui";
import { generalEnquiryMessage, telLink, whatsAppLink } from "@/lib/contact";

/**
 * Fixed call / WhatsApp bar, mobile only.
 *
 * There is no contact page any more, so this is the primary way a visitor on a
 * phone reaches Vkon. Two flat rectangles split down the middle — no pills, no
 * brand-green WhatsApp button competing with the page.
 */
export function MobileActionBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 border-t border-band-line bg-band md:hidden">
      <a
        href={telLink()}
        className="flex h-14 items-center justify-center gap-2.5 text-sm font-medium text-band-ink"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <PhoneIcon className="h-4 w-4" />
        Call
      </a>
      <a
        href={whatsAppLink(generalEnquiryMessage)}
        className="flex h-14 items-center justify-center gap-2.5 border-l border-band-line text-sm font-medium text-band-ink"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <WhatsAppIcon className="h-4 w-4" />
        WhatsApp
      </a>
    </div>
  );
}
