"use client";

import { useEffect, useState } from "react";
import { PhoneIcon, WhatsAppIcon } from "@/components/icons/ui";
import { generalEnquiryMessage, telLink, whatsAppLink } from "@/lib/contact";
import { site } from "@/content/site";

/**
 * Floating call and WhatsApp buttons, bottom right, desktop only.
 *
 * These replace the phone number that sat in the header's top right. The header
 * retracts on the way down the page, which took the only way to call with it;
 * a fixed control does not go anywhere. It slides upward when the footer's
 * final copyright/social row enters the viewport, leaving that row clear
 * without changing its normal position everywhere else.
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
 * **Each button's hover carries its own colour** (client request, 2026-08-21):
 * WhatsApp green, call blue — reversing the earlier "no brand colour" call
 * `MobileActionBar` made, which read the two as one undifferentiated family.
 * `#1DA851` rather than the `#25D366` WhatsApp mark: that carries a white
 * glyph at only 1.98:1, under the 3:1 a meaningful icon needs, and `#1DA851`
 * is the lightest green that clears it. `#2563eb` for call is chosen to the
 * same standard.
 */
export function FloatingContact() {
  const [footerRowVisible, setFooterRowVisible] = useState(false);

  useEffect(() => {
    const footerRow = document.querySelector("[data-footer-social-row]");
    if (!footerRow) return;

    const observer = new IntersectionObserver(
      ([entry]) => setFooterRowVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(footerRow);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`pointer-events-none fixed bottom-6 right-6 z-40 hidden flex-col gap-3 transition-transform duration-500 ease-out md:flex ${
        footerRowVisible ? "-translate-y-28" : "translate-y-0"
      }`}
    >
      <FloatingButton
        href={whatsAppLink(generalEnquiryMessage)}
        label="Message us on WhatsApp"
        hoverColor="#1DA851"
        external
      >
        <WhatsAppIcon className="h-5 w-5" />
      </FloatingButton>

      <FloatingButton
        href={telLink()}
        label={`Call ${site.phone.display}`}
        hoverColor="#2563eb"
      >
        <PhoneIcon className="h-5 w-5" />
      </FloatingButton>
    </div>
  );
}

function FloatingButton({
  href,
  label,
  hoverColor,
  external = false,
  children,
}: {
  href: string;
  label: string;
  /** Border and glyph colour on hover/focus — see the note on the component. */
  hoverColor: string;
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
        swallow clicks on whatever sits beneath it between the two buttons.

         The colour-only hover it had before read as static next to every other
         interactive element on the site, which all pair a colour change with
         some motion (`ProductCard`'s lift, the carousels' pop). `scale` and a
         lift here match that same idiom, plus `active:scale-95` so a click
         reads as a press rather than nothing happening until the page navigates.

         `hoverColor` is set as a CSS variable rather than a Tailwind arbitrary
         class per button: Tailwind's build-time scan needs a literal class
         string in the source to generate one, and `hover:border-[${hoverColor}]`
         built from a prop is invisible to that scan and would ship no rule
         at all. */
      style={{ "--hover-color": hoverColor } as React.CSSProperties}
      className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-band-line bg-band text-band-ink shadow-card-hover transition-[transform,box-shadow,border-color,color] duration-200 hover:-translate-y-1 hover:scale-110 hover:border-[var(--hover-color)] hover:text-[var(--hover-color)] hover:shadow-card-hover active:scale-95"
    >
      {children}
      <span className="sr-only">{label}</span>
    </a>
  );
}
