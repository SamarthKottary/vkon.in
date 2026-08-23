import Link from "next/link";
import { CartList } from "@/components/cart/CartList";
import { Container } from "@/components/ui/Container";
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
            <li aria-current="page">Cart</li>
          </ol>
        </nav>

        <h1 className="mt-8 text-[2rem] leading-tight sm:text-[2.5rem]">Cart</h1>
        <p className="mt-3 max-w-xl leading-relaxed text-body">
          Kept on this device only — nothing is sent to us until you ask for a
          quote.
        </p>

        <div className="mt-10">
          <CartList products={products} />
        </div>
      </Container>
    </section>
  );
}
