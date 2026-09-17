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
 * applies: this describes what the checkout in this codebase actually does,
 * not generic e-commerce boilerplate.
 *
 * **Rewritten 2026-09-17 for live payments.** It used to say an order was
 * placed unpaid and settled on a phone call, with delivery priced on that
 * call. Since Razorpay went live the customer pays at checkout, and the
 * delivery charge comes from Shiprocket before they pay. The cancellation and
 * refund terms are the client's own: cancel any time before dispatch, refunds
 * reach the customer in 5–7 days, and the customer pays return shipping on an
 * item ordered to the wrong specification. The cancellation email
 * (`sendOrderUpdateMail`) and the cancelled-order panel repeat the refund
 * wording — change all three together.
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
          <p className="mt-3 text-sm text-muted">Last updated 17 September 2026.</p>

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
                  Prices are in Indian Rupees. GST and the delivery charge are
                  added at checkout, and the full total is shown before you pay.
                </li>
                <li>
                  Some products on the site are priced on request rather than
                  shown online; those are quoted individually when you contact
                  us.
                </li>
                <li>
                  We may decline or cancel an order — for example if a product
                  is out of stock, or a price was shown in error. We will tell
                  you if we do, and refund anything you have paid in full.
                </li>
              </ul>
            </Section>

            <Section title="Payment">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  You pay when you place your order: online by UPI, debit or
                  credit card, or netbanking, or by cash on delivery where that
                  option is offered at checkout.
                </li>
                <li>
                  Online payments are processed securely by Razorpay. We never
                  see or store your card, UPI or bank details.
                </li>
                <li>
                  If an online payment does not go through, your order is kept
                  and you can pay for it again from{" "}
                  <Link href="/account/orders" className="text-accent hover:underline">
                    your order history
                  </Link>
                  .
                </li>
              </ul>
            </Section>

            <Section title="Delivery">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  The delivery charge is worked out at checkout from your
                  delivery address and the size and weight of your order, and
                  is shown before you pay. Where more than one service is
                  available, you choose between them — for example Standard or
                  Express.
                </li>
                <li>
                  If a delivery charge cannot be worked out online for your
                  address, we call you to agree it before anything is
                  dispatched.
                </li>
                <li>
                  We email you when your order is dispatched, with a link to
                  track it, and your order page shows where it is. Delivery
                  times are the courier&rsquo;s estimates, not guarantees.
                </li>
              </ul>
            </Section>

            <Section title="Cancelling an order">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-ink">
                    You can cancel any order until it is dispatched.
                  </strong>{" "}
                  Call or WhatsApp us on{" "}
                  <a href={`tel:${site.phone.href}`} className="text-accent hover:underline">
                    {site.phone.display}
                  </a>
                  , or email{" "}
                  <a href={`mailto:${site.email}`} className="text-accent hover:underline">
                    {site.email}
                  </a>
                  , with your order number. We confirm the cancellation by
                  email.
                </li>
                <li>
                  Once an order has been dispatched it can no longer be
                  cancelled. See returns below.
                </li>
              </ul>
            </Section>

            <Section title="Refunds">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  If you cancel before dispatch, or we cancel your order, an
                  online payment is refunded in full to the payment method you
                  used.
                </li>
                <li>
                  <strong className="text-ink">
                    A refund takes 5–7 days to reach your account.
                  </strong>{" "}
                  An order paid by cash on delivery that is cancelled before
                  dispatch has nothing to refund.
                </li>
              </ul>
            </Section>

            <Section title="Returns and warranty">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  A manufacturing fault is covered under warranty — call or
                  email us with your order number and we will sort it out.
                </li>
                <li>
                  This is electrical equipment sized and specified for a
                  particular pump or panel, so please check the rating and
                  specification with us before ordering if you are at all
                  unsure.
                </li>
                <li>
                  If you ordered the wrong specification, contact us before
                  sending anything back so we can confirm the return.{" "}
                  <strong className="text-ink">
                    The cost of shipping it back to us is yours.
                  </strong>{" "}
                  Once it reaches us and we have checked it, we refund you, and
                  the refund takes 5–7 days to reach your account.
                </li>
              </ul>
            </Section>

            <Section title="Using the site">
              <p>
                The content on this site — text, photographs, product
                specifications — belongs to {site.legalName}{" "}unless stated
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
