import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { Container } from "@/components/ui/Container";
import { PageHero, SECTION_BACKGROUND } from "@/components/layout/PageHero";
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
    <>
      <PageHero
        compact
        background={SECTION_BACKGROUND}
        priority
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Cart", href: "/cart" },
        ]}
        title="Checkout"
        description="Confirm the addresses and what is in your order — we call before dispatch."
      />

      {/* `data-curtain` is what pushes the header up once the band has
          scrolled by — see the note in `Header`. It marks the sheet of content
          below the image, not the image itself. */}
      <section data-curtain className="relative bg-surface py-12 sm:py-14 lg:py-16">
        <Container size="wide">
        <p className="mt-1.5 break-all text-xs text-muted sm:text-sm">
          Signed in as {customer.email}
        </p>

        <div className="mt-8 sm:mt-10">
          <CheckoutForm products={products} addresses={addresses} />
        </div>
        </Container>
      </section>
    </>
  );
}
