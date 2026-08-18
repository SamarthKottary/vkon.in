import { CopyEmail } from "@/components/home/CopyEmail";
import { SubscribePanel } from "@/components/layout/SubscribePanel";
import { MailIcon, PhoneIcon, WhatsAppIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { site } from "@/content/site";
import { generalEnquiryMessage, telLink, whatsAppLink } from "@/lib/contact";

/**
 * The closing block of every page: mailing list sign-up, then contact.
 *
 * **The sign-up is rendered from here, not from the layout.** It used to sit in
 * `(site)/layout.tsx` between `<main>` and the footer, which put it *below* the
 * contact block on every page. Moving it above meant either editing all five
 * pages that end with a `ContactStrip` — five places for one ordering rule to
 * drift — or stating the rule once, here. A page that closes with contact
 * details closes with the sign-up above them, and there is nowhere else for
 * that to be got wrong.
 *
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
      icon: PhoneIcon,
      note: "Fastest for price and stock",
    },
    {
      label: "WhatsApp",
      value: "Message us",
      href: whatsAppLink(generalEnquiryMessage),
      icon: WhatsAppIcon,
      note: "Photograph your existing panel",
    },
  ];

  return (
    <>
      <SubscribePanel />

      <section className="border-t border-line bg-surface-subtle py-16 sm:py-20">
        <Container size="wide">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
            <div>
              <h2 className="text-[1.75rem] leading-tight sm:text-3xl">
                {heading}
              </h2>
              <p className="mt-4 leading-relaxed text-body">{body}</p>
              <p className="label-tech mt-6 text-muted">{site.hours}</p>
            </div>

            <ul className="grid border-t border-line sm:grid-cols-[1fr_1fr_1.5fr] sm:border-t-0">
              {channels.map((channel) => (
                <li
                  key={channel.label}
                  className="border-b border-line py-6 sm:border-b-0 sm:border-l sm:px-6 sm:py-0 sm:first:border-l-0 sm:first:pl-0"
                >
                  {/* Icon rides with the label, not the value. Inline with the
                    value it eats ~24px of a third-width column, which is what
                    broke the email address across two lines. */}
                  <p className="label-tech flex items-center gap-2 text-muted">
                    <channel.icon className="h-3.5 w-3.5" />
                    {channel.label}
                  </p>
                  <a
                    href={channel.href}
                    className="mt-3 block break-words font-mono text-base leading-snug text-ink underline-offset-4 hover:text-accent hover:underline lg:text-lg"
                  >
                    {channel.value}
                  </a>
                  <p className="mt-2 text-sm text-muted">{channel.note}</p>
                </li>
              ))}

              {/* Email is its own component: a bare mailto: silently does nothing
                on a desktop with no mail client registered. */}
              <li className="border-b border-line py-6 sm:border-b-0 sm:border-l sm:px-6 sm:py-0">
                <p className="label-tech flex items-center gap-2 text-muted">
                  <MailIcon className="h-3.5 w-3.5" />
                  Email
                </p>
                <CopyEmail
                  email={site.email}
                  subject={`Enquiry from ${site.domain}`}
                />
                <p className="mt-2 text-sm text-muted">
                  Dealer and bulk enquiries
                </p>
              </li>
            </ul>
          </div>
        </Container>
      </section>
    </>
  );
}
