import { CartList } from "@/components/cart/CartList";
import { Container } from "@/components/ui/Container";
import { PageHero, SECTION_BACKGROUND } from "@/components/layout/PageHero";
import { listProducts } from "@/lib/db/products";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Cart",
  description:
    "The products you have picked out, ready to send us for a quote.",
  path: "/cart",
  /* A personal, device-local page with nothing to index — and one whose
     content differs for every visitor. */
  noIndex: true,
});

/** The catalogue is read per request, so a product edited in the admin is
 *  reflected in an open cart on the next load rather than one behind. */
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const products = await listProducts();

  return (
    <>
      <PageHero
        compact
        background={SECTION_BACKGROUND}
        priority
        breadcrumb={[{ label: "Home", href: "/" }]}
        title="Cart"
        description="Kept on this device only — nothing is sent to us until you ask for a quote."
      />

      {/* Pushes the header up once the band is past — see `Header`. */}
      <section data-curtain className="relative bg-surface py-12 sm:py-14 lg:py-16">
        <Container size="wide">
        <div>
          <CartList products={products} />
        </div>
        </Container>
      </section>
    </>
  );
}
