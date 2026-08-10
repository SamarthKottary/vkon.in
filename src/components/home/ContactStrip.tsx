import { Container } from "@/components/ui/Container";
import { site } from "@/content/site";
import {
  generalEnquiryMessage,
  mailtoLink,
  telLink,
  whatsAppLink,
} from "@/lib/contact";

/**
 * Contact block. Stands in for the contact page, which no longer exists.
 *
 * Three channels as equal columns divided by rules — no card, no filled CTA
 * band, no centred "Get in touch!" heading. The phone number is set large in
 * mono because it is the thing most visitors came for.
 */
export function ContactStrip({
  heading = "Tell us what you're running",
  body = "Motor rating, supply type and location is usually all we need to point you at the right panel and your nearest dealer.",
}: {
  heading?: string;
  body?: string;
}) {
  const channels = [
    {
      label: "Call",
      value: site.phone.display,
      href: telLink(),
      note: "Fastest for price and stock",
    },
    {
      label: "WhatsApp",
      value: "Send a message",
      href: whatsAppLink(generalEnquiryMessage),
      note: "Photograph your existing panel",
    },
    {
      label: "Email",
      value: site.email,
      href: mailtoLink(`Enquiry from ${site.domain}`),
      note: "Dealer and bulk enquiries",
      // Long addresses otherwise wrap inside a third-width column.
      compact: true,
    },
  ];

  return (
    <section className="border-t border-line bg-surface-subtle py-16 sm:py-20">
      <Container size="wide">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
          <div>
            <h2 className="text-[1.75rem] leading-tight sm:text-3xl">{heading}</h2>
            <p className="mt-4 leading-relaxed text-body">{body}</p>
            <p className="label-tech mt-6 text-muted">{site.hours}</p>
          </div>

          <ul className="grid border-t border-line sm:grid-cols-[1fr_1fr_1.35fr] sm:border-t-0">
            {channels.map((channel) => (
              <li
                key={channel.label}
                className="border-b border-line py-6 sm:border-b-0 sm:border-l sm:px-6 sm:py-0 sm:first:border-l-0 sm:first:pl-0"
              >
                <p className="label-tech text-muted">{channel.label}</p>
                <a
                  href={channel.href}
                  className={`mt-3 block break-words font-mono leading-snug text-ink underline-offset-4 hover:text-accent hover:underline ${
                    channel.compact ? "text-sm lg:text-base" : "text-base lg:text-lg"
                  }`}
                >
                  {channel.value}
                </a>
                <p className="mt-2 text-sm text-muted">{channel.note}</p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
