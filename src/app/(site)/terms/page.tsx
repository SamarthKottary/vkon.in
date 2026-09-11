import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { formattedAddress, site } from "@/content/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Terms of Service",
  description: `The terms that apply to browsing ${site.domain} and ordering from ${site.legalName}.`,
  path: "/terms",
});

/**
 * Added 2026-09-07, alongside `/privacy` — see that page's note. Same rule
 * applies: this describes what the checkout in this codebase actually does
 * (an order is placed unpaid and settled by phone, per docs/PAYMENTS.md), not
 * generic e-commerce boilerplate. It goes out of date the day payment is
 * wired up and the "how you pay" section needs rewriting alongside the code.
 */
export default function TermsPage() {
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
              <li aria-current="page">Terms of Service</li>
            </ol>
          </nav>

          <h1 className="mt-8 text-[2rem] leading-tight sm:text-[2.5rem]">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-muted">Last updated 7 September 2026.</p>

          <div className="mt-10 space-y-10">
            <Section title="Who this agreement is with">
              <p>
                These terms are between you and {site.legalName} ({formattedAddress}
                ), and apply to browsing{" "}
                <a href={site.url} className="text-accent hover:underline">
                  {site.domain}
                </a>
                , creating an account, and placing an order. Using the site
                means you accept them.
              </p>
            </Section>

            <Section title="Accounts">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  You need an account to check out. Browsing and building a cart
                  do not.
                </li>
                <li>
                  Keep your password to yourself; you are responsible for
                  activity under your account. Tell us straight away at{" "}
                  <a
                    href={`mailto:${site.email}`}
                    className="text-accent hover:underline"
                  >
                    {site.email}
                  </a>{" "}
                  if you think someone else has access to it.
                </li>
                <li>Give us accurate details — a name, an address, a number we can reach you on.</li>
              </ul>
            </Section>

            <Section title="Orders and pricing">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  Prices shown are in Indian Rupees and include GST at the rate
                  displayed at checkout.
                </li>
                <li>
                  <strong className="text-ink">
                    Placing an order does not take a payment.
                  </strong>{" "}
                  We call you on the number attached to your delivery address to
                  confirm the order and the delivery charge before anything is
                  dispatched. Payment is currently arranged on that call.
                </li>
                <li>
                  An order is not accepted until we confirm it with you. We may
                  decline or cancel an order — for example if a product is out
                  of stock, or a price was shown in error — and will tell you if
                  we do.
                </li>
                <li>
                  Some products on the site are priced on request rather than
                  shown online; those are quoted individually when you contact
                  us.
                </li>
              </ul>
            </Section>

            <Section title="Delivery">
              <p>
                Delivery charges and timelines are confirmed on the call after
                you order, since they depend on where the order is going and
                what it weighs. We aim to get agricultural and industrial
                equipment to you promptly, but a date given on the phone is an
                estimate, not a guarantee.
              </p>
            </Section>

            <Section title="Returns and warranty">
              <p>
                A manufacturing fault is covered under warranty — call or email
                us with your order number and we will sort it out. Because this
                is electrical equipment sized and specified for a particular
                pump or panel, we ask that you check the rating and
                specification with us before ordering if you are at all unsure;
                a correctly working item ordered to the wrong specification may
                not be returnable.
              </p>
            </Section>

            <Section title="Using the site">
              <p>
                The content on this site — text, photographs, product
                specifications — belongs to {site.legalName} unless stated
                otherwise, and is here so you can find and understand our
                products, not for reuse elsewhere. Don&rsquo;t attempt to
                interfere with the site&rsquo;s operation, scrape it at scale,
                or use it for anything unlawful.
              </p>
            </Section>

            <Section title="Liability">
              <p>
                We supply our products and this site with reasonable skill and
                care, but nothing here excludes any liability that Indian law
                does not allow us to exclude. Beyond that, our liability to you
                is limited to the value of the order in question.
              </p>
            </Section>

            <Section title="Changes to these terms">
              <p>
                If we change these terms, we will update this page and change
                the date at the top. Continuing to use the site after a change
                means you accept the update.
              </p>
            </Section>

            <Section title="Governing law">
              <p>
                These terms are governed by the laws of India, and any dispute
                is subject to the courts having jurisdiction over{" "}
                {site.address.locality}, {site.address.region}.
              </p>
            </Section>

            <Section title="Contact">
              <p>
                Questions about an order or these terms:{" "}
                <a
                  href={`mailto:${site.email}`}
                  className="text-accent hover:underline"
                >
                  {site.email}
                </a>{" "}
                or{" "}
                <a
                  href={`tel:${site.phone.href}`}
                  className="text-accent hover:underline"
                >
                  {site.phone.display}
                </a>
                . See also our{" "}
                <Link href="/privacy" className="text-accent hover:underline">
                  Privacy Policy
                </Link>
                .
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
