import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactStrip } from "@/components/home/ContactStrip";
import { CheckIcon, PhoneIcon, WhatsAppIcon } from "@/components/icons/ui";
import { ProductMedia } from "@/components/product/ProductMedia";
import { RecordView } from "@/components/product/RecordView";
import { RelatedProducts } from "@/components/product/RelatedProducts";
import { ProtectionList } from "@/components/product/ProtectionList";
import { SpecTable } from "@/components/product/SpecTable";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { JsonLd } from "@/components/ui/JsonLd";
import { categoryLabel } from "@/content/taxonomy";
import { site } from "@/content/site";
import { getProductBySlug, listProducts } from "@/lib/db/products";
import { productEnquiryMessage, telLink, whatsAppLink } from "@/lib/contact";
import { breadcrumbJsonLd, pageMetadata, productJsonLd } from "@/lib/seo";

/**
 * Rendered per request. Products are created after deploy, so there is no
 * useful set to prerender at build time, and caching would delay edits by one
 * request (see the note on the home page).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return pageMetadata({
      title: "Product not found",
      description: "This product is no longer listed.",
      path: `/products/${slug}`,
    });
  }

  const hp = product.hpRanges.length ? ` — ${product.hpRanges.join(", ")}` : "";

  return pageMetadata({
    title: `${product.name}${hp}`,
    description: product.tagline || product.description.slice(0, 160),
    path: `/products/${product.slug}`,
    images: product.images.map((image) => image.url),
  });
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) notFound();

  const all = await listProducts();

  /* Related products: same sub-category only, never widened.

     A visitor at the bottom of a product page is looking for an alternative to
     the thing they are reading about, and something from another sub-category
     is not one. The section is absent when a sub-category holds a single
     product — better an empty than a misleading one. */
  const related = all.filter(
    (p) => p.id !== product.id && p.category === product.category,
  );

  // Blank lines separate paragraphs in the admin textarea.
  const paragraphs = product.description
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <>

    <RecordView slug={product.slug} />
      <div className="border-b border-line">
        <Container size="wide">
          <nav aria-label="Breadcrumb" className="py-4">
            <ol className="label-tech flex flex-wrap items-center gap-2 text-muted">
              <li>
                <Link href="/" className="hover:text-ink">
                  Home
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link href="/products" className="hover:text-ink">
                  Products
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="text-ink" aria-current="page">
                {product.name}
              </li>
            </ol>
          </nav>
        </Container>
      </div>

      <section className="py-10 sm:py-14">
        <Container size="wide">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <ProductMedia
              images={product.images}
              videoUrl={product.videoUrl}
              videoTitle={product.videoTitle}
              productName={product.name}
            />

            <div>
              <p className="label-tech text-muted">
                {categoryLabel(product.category)}
              </p>

              <h1 className="mt-3 text-[2.25rem] leading-[1.08] sm:text-5xl">
                {product.name}
              </h1>

              {product.tagline && (
                <p className="mt-5 text-lg leading-relaxed text-body">
                  {product.tagline}
                </p>
              )}

              {product.hpRanges.length > 0 && (
                <div className="mt-8 border-t border-line pt-5">
                  <p className="label-tech text-muted">Available ratings</p>
                  <p className="mt-2 font-mono text-lg text-ink">
                    {product.hpRanges.join("  ·  ")}
                  </p>
                </div>
              )}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button href={whatsAppLink(productEnquiryMessage(product))} size="lg">
                  <WhatsAppIcon className="h-4 w-4" />
                  Enquire on WhatsApp
                </Button>
                <Button href={telLink()} variant="outline" size="lg">
                  <PhoneIcon className="h-4 w-4" />
                  {site.phone.display}
                </Button>
              </div>

              {product.spec.length > 0 && (
                <div className="mt-10">
                  <p className="label-tech mb-2 text-muted">Specification</p>
                  <SpecTable rows={product.spec} />
                </div>
              )}
            </div>
          </div>
        </Container>
      </section>

      {paragraphs.length > 0 && (
        <section className="border-t border-line py-14 sm:py-16">
          <Container size="wide">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
              <h2 className="label-tech pt-1 text-muted">Description</h2>
              <div className="max-w-2xl space-y-5 text-[1.0625rem] leading-relaxed text-body">
                {paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </div>
          </Container>
        </section>
      )}

      {product.features.length > 0 && (
        <section className="border-t border-line py-14 sm:py-16">
          <Container size="wide">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
              <h2 className="label-tech pt-1 text-muted">Features</h2>
              <ul className="grid gap-x-12 gap-y-3 sm:grid-cols-2">
                {product.features.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span className="text-[0.9375rem] leading-relaxed text-body">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Container>
        </section>
      )}

      {product.protections.length > 0 && (
        <section className="border-t border-line py-14 sm:py-16">
          <Container size="wide">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-16">
              <h2 className="label-tech pt-1 text-muted">Protection</h2>
              <ProtectionList keys={product.protections} />
            </div>
          </Container>
        </section>
      )}

      {related.length > 0 && (
        <section className="border-t border-line py-14 sm:py-16">
          <Container size="wide">
            <RelatedProducts heading="Similar products" products={related} />
          </Container>
        </section>
      )}

      <ContactStrip
        heading={`Want a price on the ${product.name}?`}
        body="Send the motor rating and your location and we will quote, along with the nearest dealer who stocks it."
      />

      <JsonLd data={productJsonLd(product)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Products", path: "/products" },
          { name: product.name, path: `/products/${product.slug}` },
        ])}
      />
    </>
  );
}
