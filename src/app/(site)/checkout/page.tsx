import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { Container } from "@/components/ui/Container";
import { getCurrentCustomer } from "@/lib/account";
import { listAddresses } from "@/lib/db/addresses";
import { listProducts } from "@/lib/db/products";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Checkout",
  description: "Confirm your delivery address and place your order.",
  path: "/checkout",
  noIndex: true,
});

/** Reads a session, a catalogue and a customer's addresses. None of it is
 *  cacheable and all of it differs per visitor. */
export const dynamic = "force-dynamic";

/**
 * Checkout — the one page on the site that requires an account.
 *
 * The client's shape for this: browse and fill a basket as a stranger, sign in
 * at the point of ordering ("We can login then or when we add to cart then
 * check out"). Everything before this page works signed out, which matters for
 * an audience that arrives from a search result on a phone and will not make
 * an account to find out what a starter costs.
 *
 * The sign-in redirect carries `next=/checkout`, so signing in or registering
 * comes straight back here with the cart — which lives in `localStorage` and
 * was never at risk from the round trip — still intact.
 */
export default async function CheckoutPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    /* `error=checkout` is what makes the sign-in page explain *why* it is
       asking. Landing on a bare sign-in form after pressing "Checkout" reads
       like the button was broken. */
    redirect("/account/login?next=%2Fcheckout&error=checkout");
  }

  const [products, addresses] = await Promise.all([
    listProducts(),
    listAddresses(customer.id),
  ]);

  return (
    <section className="py-12 sm:py-14 lg:py-16">
      <Container size="wide">
        <nav aria-label="Breadcrumb">
          <ol className="label-tech flex flex-wrap items-center gap-2 text-muted">
            <li>
              <Link href="/" className="hover:text-ink">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href="/cart" className="hover:text-ink">
                Cart
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page">Checkout</li>
          </ol>
        </nav>

        <h1 className="mt-6 text-[1.75rem] leading-tight sm:mt-8 sm:text-[2rem] lg:text-[2.5rem]">
          Checkout
        </h1>
        {/* The address is its own line and quieter than the sentence. Run
            together at body size it was four lines on a 390px phone before the
            first thing the customer has to *do*, and most of it was an email
            address they already know. */}
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-body sm:text-base">
          Confirm who this is billed to, where it goes, and what is in it — we
          will call you to confirm before anything is dispatched.
        </p>
        <p className="mt-1.5 break-all text-xs text-muted sm:text-sm">
          Signed in as {customer.email}
        </p>

        <div className="mt-8 sm:mt-10">
          <CheckoutForm products={products} addresses={addresses} />
        </div>
      </Container>
    </section>
  );
}
