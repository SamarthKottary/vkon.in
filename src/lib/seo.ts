import type { Metadata } from "next";
import { formattedAddress, site } from "@/content/site";
import type { Product } from "./types";

/**
 * The static routes whose SEO is editable at /admin/seo. Product pages manage
 * their own SEO on the product form, so they are not listed here.
 */
export const SEO_PAGES = [
  { path: "/", label: "Home" },
  { path: "/products", label: "Products" },
  { path: "/protection", label: "Protection" },
  { path: "/about", label: "About" },
  { path: "/contact", label: "Contact" },
] as const;

/** Builds page metadata with sensible Open Graph and Twitter defaults. */
export function pageMetadata({
  title,
  description,
  path = "/",
  images,
  /**
   * Bypass the root layout's `%s | Vkon` template. Set this when the title
   * already carries the brand — otherwise it renders twice, as the live home
   * page did: "Vkon — Motor Starters ... | Vkon".
   */
  absoluteTitle = false,
  /**
   * Keep the page out of search results. For pages whose content belongs to
   * one visitor and differs for every other — the cart is the first — where
   * there is nothing to rank and indexing one person's would be meaningless.
   * The route stays out of `sitemap.ts` for the same reason; this is the half
   * that also covers a crawler arriving by link.
   */
  noIndex = false,
}: {
  title: string;
  description: string;
  path?: string;
  images?: string[];
  absoluteTitle?: boolean;
  noIndex?: boolean;
}): Metadata {
  const url = `${site.url}${path}`;
  const resolvedImages = images?.length ? images : [site.ogImage];

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      url,
      siteName: site.name,
      type: "website",
      locale: "en_IN",
      images: resolvedImages,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: resolvedImages,
    },
  };
}

/**
 * Organisation + local business data. Rendered once in the root layout so the
 * phone number and address are eligible to appear directly in search results.
 *
 * `@type` is `["Organization", "LocalBusiness"]`, not `"LocalBusiness"` alone
 * (flagged 2026-08-27: a plain `LocalBusiness` type is what Google's Logo
 * structured-data guidelines warn against — their own examples use
 * `Organization`, and a business-only type reportedly does not reliably feed
 * their logo/Knowledge Panel indexing pipeline, even though `LocalBusiness`
 * technically extends `Organization`). An array of types is valid JSON-LD,
 * and every field already set below (`address`, `telephone`, `foundingDate`,
 * `areaServed`) is a plain `Organization`-or-inherited property, not
 * something `Place`-specific like `openingHoursSpecification` or `geo` that
 * only `LocalBusiness` would carry — so nothing already working (the phone
 * number and address search results this function's own comment mentions)
 * is put at risk by adding `Organization` alongside it, only gained. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "LocalBusiness"],
    "@id": `${site.url}#organization`,
    name: site.legalName,
    alternateName: site.name,
    url: site.url,
    logo: site.logo,
    image: site.logo,
    description: site.description,
    telephone: site.phone.href,
    email: site.email,
    foundingDate: String(site.founded),
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.street,
      addressLocality: site.address.locality,
      addressRegion: site.address.region,
      postalCode: site.address.postalCode,
      addressCountry: site.address.country,
    },
    areaServed: "IN",
    /* Google uses sameAs to tie the site to its social profiles. Reads the
       same array the footer renders, so the two cannot disagree. */
    sameAs: site.socials.map((s) => s.href),
  };
}

export function productJsonLd(product: Product) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.tagline || product.description.slice(0, 300),
    category: product.category,
    url: `${site.url}/products/${product.slug}`,
    // Image URLs are absolute already (Vercel Blob), so they are used as-is.
    ...(product.images.length
      ? { image: product.images.map((i) => i.url) }
      : {}),
    ...(product.videoUrl
      ? {
          subjectOf: {
            "@type": "VideoObject",
            name: product.videoTitle || `${product.name} overview`,
            contentUrl: product.videoUrl,
          },
        }
      : {}),
    brand: { "@type": "Brand", name: site.name },
    manufacturer: {
      "@type": "Organization",
      name: site.legalName,
      address: formattedAddress,
    },
    additionalProperty: product.spec.map((row) => ({
      "@type": "PropertyValue",
      name: row.label,
      value: row.value,
    })),
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${site.url}${item.path}`,
    })),
  };
}
