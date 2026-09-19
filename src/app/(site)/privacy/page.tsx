import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { formattedAddress, site } from "@/content/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy Policy",
  description: `How ${site.legalName} collects, uses and protects the information you share with us.`,
  path: "/privacy",
});

/**
 * Added 2026-09-07, prompted by Google's OAuth consent screen requiring a
 * privacy policy link for an External app — but the content itself is not a
 * formality written to satisfy that form. It is a plain description of what
 * this codebase actually does with data, kept in sync with it deliberately:
 *
 *  - The cookie names, the accounts (`customers`, `customer_sessions`,
 *    `addresses`, `orders`), the outside processors, and the absence of
 *    analytics are all facts read from the code, not boilerplate. If a future
 *    change adds a tracking script or a new processor, this page is now wrong
 *    until it is updated alongside it.
 *  - **Revised 2026-09-17** when online payment went live. Razorpay (payments)
 *    and Shiprocket (delivery) joined Resend and Google as processors, and the
 *    page gained the sign-in-code cookies (`vkon_signin`, `vkon_device`), the
 *    signed-in cart, courier tracking, and the Google Maps embed on /contact,
 *    which had never been listed. What each processor receives was checked
 *    against the code: Razorpay gets name, email, phone, the order number and
 *    amount (`/api/payment/create`, `PayNowButton`); Shiprocket gets names,
 *    addresses, phone numbers, items and value — and, since 2026-09-19, the
 *    customer's email, because Shiprocket now sends the delivery emails
 *    (`bookShipmentAction`).
 *  - It exists once (this page and `/terms`) rather than as a client-facing
 *    doc elsewhere, so it is one thing to keep current, not two.
 */
export default function PrivacyPage() {
  return (
    <section className="py-12 sm:py-16 lg:py-20">
      <Container size="wide">
        <div className="mx-auto max-w-2xl">
          <nav aria-label="Breadcrumb">
            <ol className="label-tech flex flex-wrap items-center gap-2 text-muted">
              <li>
                <Link href="/" className="hover:text-ink">
                  Home
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li aria-current="page">Privacy Policy</li>
            </ol>
          </nav>

          <h1 className="mt-8 text-[2rem] leading-tight sm:text-[2.5rem]">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-muted">Last updated 17 September 2026.</p>

          <div className="prose-legal mt-10 space-y-10">
            <Section title="Who we are">
              <p>
                {site.legalName} ({formattedAddress}) makes motor starters, industrial
                panels and home automation for agricultural and industrial pumps.
                This policy covers the website at{" "}
                <a href={site.url} className="text-accent hover:underline">
                  {site.domain}
                </a>{" "}
                and the account you can create on it.
              </p>
            </Section>

            <Section title="What we collect">
              <p>Only what a specific feature on the site actually needs:</p>
              <dl className="mt-4 space-y-4">
                <Item term="Browsing the catalogue">
                  Nothing personal. We run no analytics or advertising trackers —
                  there is no Google Analytics, Meta Pixel or similar on this
                  site. Two things on the site do come from outside services;
                  see &ldquo;Who else sees it&rdquo; below.
                </Item>
                <Item term="The mailing list and the contact form">
                  Your email, and — for the contact form — your name, phone
                  number and message.
                </Item>
                <Item term="Creating an account">
                  Your name, email and (if you give one) phone number. If you set
                  a password, it is never stored as typed — see &ldquo;How we
                  store passwords&rdquo; below. If you sign in with Google, we
                  receive your name, email address and Google&rsquo;s internal
                  account identifier, not your Google password.
                </Item>
                <Item term="Signing in">
                  When you sign in, and when you last did. The first time you
                  sign in on a browser, we email you a one-time code; once
                  entered, that browser is remembered for 30 days so you are not
                  asked again. For both, we record the browser and device type
                  your browser reports, so a sign-in can be recognised.
                </Item>
                <Item term="Saving a delivery address">
                  The name, phone number and address you enter for delivery, and
                  a GSTIN if you add one for a business invoice.
                </Item>
                <Item term="Your cart">
                  While you are signed out, your cart stays in your browser. While
                  you are signed in, it is also saved to your account, so it
                  follows you to another device.
                </Item>
                <Item term="Placing an order">
                  The items, quantities and price you agreed to, the billing and
                  delivery addresses for that order, and any note you add for us.
                  If you pay online, Razorpay&rsquo;s reference for the payment
                  and whether it succeeded — never your card, UPI or bank
                  details. Once the order ships, the courier&rsquo;s tracking
                  status and history. This is kept as a permanent record of the
                  transaction, the way an invoice would be, even if you later
                  delete a saved address or change your account details.
                </Item>
              </dl>
            </Section>

            <Section title="Cookies">
              <p>
                We use a small number of cookies to make the site work — not to
                track you across other websites, and not for advertising.
              </p>
              <dl className="mt-4 space-y-3">
                <Item term={<code className="font-mono text-sm">vkon_session</code>}>
                  Keeps you signed in to your account for up to 30 days. Set only
                  after you sign in or register; removed when you sign out.
                </Item>
                <Item term={<code className="font-mono text-sm">vkon_signin</code>}>
                  Exists for ten minutes at most, between entering your password
                  and entering the code we email you. Deleted once you finish
                  signing in.
                </Item>
                <Item term={<code className="font-mono text-sm">vkon_device</code>}>
                  Remembers that this browser has already passed the emailed
                  code, for 30 days, so you are not asked for one every time.
                </Item>
                <Item term={<code className="font-mono text-sm">vkon_oauth</code>}>
                  Exists for a few minutes only, while you are in the middle of
                  signing in with Google, to keep that process secure. Deleted
                  automatically once it completes or expires.
                </Item>
                <Item term={<code className="font-mono text-sm">vkon_admin</code>}>
                  The same as <code className="font-mono text-sm">vkon_session</code>,
                  for our own staff sign-in to the site&rsquo;s admin area. Never
                  set for an ordinary visitor.
                </Item>
              </dl>
              <p className="mt-4">
                Your theme choice (light or dark), your cart while signed out,
                the products you viewed recently, whether you are signed in, and a
                random identifier that keeps a signed-out cart to this browser
                are kept in your
                browser&rsquo;s local storage, not in cookies. Apart from the
                cart once you sign in, none of it is sent to us.
              </p>
              <p>
                The Google Maps view on our contact page, and Razorpay&rsquo;s
                payment window when you pay, are provided by those companies and
                may set their own cookies under their own policies.
              </p>
            </Section>

            <Section title="Who else sees it">
              <p>We do not sell or rent your information. It is shared only with:</p>
              <dl className="mt-4 space-y-3">
                <Item term="Razorpay">
                  Processes online payments. When you pay, Razorpay receives the
                  order number and amount, and your name, email address and phone
                  number to fill in the payment form. Your card, UPI or bank
                  details are entered directly into Razorpay&rsquo;s secure
                  window and never reach us. Razorpay&rsquo;s own privacy policy
                  covers what you give them.
                </Item>
                <Item term="Shiprocket and its courier partners">
                  Book and deliver your order. They receive the billing and
                  delivery names, addresses and phone numbers for that order,
                  your email address, and the items and value in it. They use
                  your email and phone to send you delivery updates, and send
                  us its tracking updates.
                </Item>
                <Item term="Resend">
                  Sends the emails the site sends you — a welcome message, sign-in
                  codes, password reset links and a notice when your password
                  changes, order confirmations, payment receipts, failed-payment
                  and refund notices, and updates when an order ships, is out for
                  delivery, could not be delivered, is being returned, is
                  delivered or is cancelled. They process the address and message
                  content only to deliver that email. New orders and contact-form
                  enquiries are also emailed to our own inbox so we can act on
                  them.
                </Item>
                <Item term="Google">
                  If you choose &ldquo;Continue with Google&rdquo; to sign in,
                  Google verifies your identity to us, and we never see or store
                  your Google password. The map on our contact page is Google
                  Maps, so opening that page connects your browser to Google.
                </Item>
                <Item term="YouTube and Vimeo">
                  Some products have a video. When one is shown, its preview
                  picture may be loaded from YouTube&rsquo;s image server; the
                  video player itself loads only when you press play, and
                  YouTube videos use its reduced-tracking player.
                </Item>
              </dl>
              <p className="mt-4">
                We may also disclose information if genuinely required by Indian
                law or a valid legal request.
              </p>
            </Section>

            <Section title="How we store passwords">
              <p>
                If you set a password, we never store it as typed. It is put
                through a one-way scrambling function (a technique called
                scrypt) before it touches our database, so even we cannot read
                it back — we can only check a password you type against that
                scrambled form. If you sign in only with Google, no password is
                stored at all.
              </p>
            </Section>

            <Section title="How long we keep it">
              <p>
                An account, its saved addresses and its saved cart are kept for
                as long as the account exists. Orders — including their payment
                reference and tracking history — are kept indefinitely as a
                business and tax record, the same way a paper invoice would be,
                even after an account is closed. A sign-in code expires after ten
                minutes, and a remembered browser after 30 days. Mailing list and
                contact-form entries are kept until you ask us to remove them.
              </p>
            </Section>

            <Section title="Your choices">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  Update your name and phone number any time from{" "}
                  <Link href="/account" className="text-accent hover:underline">
                    My account
                  </Link>
                  .
                </li>
                <li>Add, edit or delete a saved address from your account.</li>
                <li>See every order you have placed under Order history.</li>
                <li>
                  Ask us to close your account, remove your details from the
                  mailing list, or answer any question about what we hold on
                  you, using the contact details below.
                </li>
              </ul>
              <p className="mt-4">
                Deleting your account does not delete the record of orders
                already placed, for the same reason a shop keeps its sales
                records after a customer relationship ends.
              </p>
            </Section>

            <Section title="Contact us">
              <p>
                Questions about this policy, or a request about your data,
                to{" "}
                <a
                  href={`mailto:${site.email}`}
                  className="text-accent hover:underline"
                >
                  {site.email}
                </a>{" "}
                or call{" "}
                <a
                  href={`tel:${site.phone.href}`}
                  className="text-accent hover:underline"
                >
                  {site.phone.display}
                </a>
                .
              </p>
            </Section>

            <Section title="Changes to this policy">
              <p>
                If what we collect or how we use it changes materially, we will
                update this page and change the date at the top.
              </p>
            </Section>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-body [&_a]:font-medium">
        {children}
      </div>
    </section>
  );
}

function Item({ term, children }: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-ink">{term}</dt>
      <dd className="mt-1 leading-relaxed text-body">{children}</dd>
    </div>
  );
}
