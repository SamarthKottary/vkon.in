# SEO Configuration & Strategy

This document details how Search Engine Optimization (SEO) is implemented across the Vkon application, how to manage metadata, and how search engines see the site.

## 1. Core Implementation

The site uses Next.js 15+ App Router metadata APIs combined with structured data (JSON-LD) to provide rich context to search engines. 

The SEO foundation lives in `src/lib/seo.ts`, which exports:
- `pageMetadata()`: A utility that generates standardized `Metadata` objects (including OpenGraph and Twitter cards) to avoid boilerplate in every route.
- `organizationJsonLd()`: Global structured data establishing the company's identity, location, and social footprint.
- `productJsonLd()`: Product-specific structured data to enable rich product snippets in search results.
- `breadcrumbJsonLd()`: Breadcrumb structured data to help search engines understand site hierarchy.

## 2. Dynamic SEO Overrides (The Admin Panel)

To give the operator control over search appearance without requiring code changes, we implemented dynamic SEO overrides editable via the `/admin` interface.

### Static Pages
Pages like Home (`/`), About (`/about`), Contact (`/contact`), Products (`/products`), and Protection (`/protection`) use `resolvePageMetadata()` from `src/lib/db/pageSeo.ts`. 

- **How it works:** When a page is requested, Next.js calls `generateMetadata()`. The page fetches its specific override from the `page_seo` database table.
- **Fallback:** If an override field (Title or Description) is left blank in the admin panel, the system seamlessly falls back to the hardcoded defaults.
- **Admin UI:** The operator can edit these at `/admin/seo`.

### Product Pages
Product pages (`/products/[slug]`) have their own SEO fields stored directly in the `products` table.
- **Editing:** When creating or editing a product at `/admin/products/[id]`, the operator can set a custom "Meta title" and "Meta description".
- **Fallback:** If left blank, the product's `name` is used for the title, and its `tagline` (or truncated description) is used for the meta description.

## 3. Structured Data (JSON-LD)

JSON-LD scripts are embedded on the page to provide machine-readable content to Google and other search engines.

1. **LocalBusiness / Organization:** Injected at the root layout level. It tells Google the legal name, contact info, address, and the official **logo** (`https://vkon.in/brand/vkon-logo-light.png`). This encourages Google to display the logo in search results and the knowledge panel.
2. **Product:** Injected on individual product pages. It includes the product name, description, image, and any technical specifications as `additionalProperty`. If a video walkthrough exists, a `VideoObject` is also attached.
3. **BreadcrumbList:** Injected on most pages to build breadcrumb trails in search results.

## 4. Best Practices for the Operator

When managing the site, the operator should follow these guidelines for the best SEO outcomes:

1. **Keep it concise:** Meta titles should be kept under 60-70 characters to prevent truncation in search results. Descriptions should be kept under 155-160 characters. The admin UI enforces these limits.
2. **Use the SEO overrides purposefully:** You don't need an override for everything. The automatic fallbacks are designed to be highly effective. Only use the override if you are targeting a specific keyword strategy (e.g., overriding a product name like "EC-DOL" with "EC-DOL Three Phase Submersible Starter").
3. **Product Images:** The first image uploaded to a product is used as the OpenGraph image when the link is shared on WhatsApp, Facebook, or LinkedIn. Ensure the first image is always high quality and clear.
4. **Social Links:** The `sameAs` property in the Organization schema reads directly from the social links in `src/content/site.ts`. Ensure these are kept up to date to help Google connect your website to your social profiles.

## 5. Technical Notes & Extensibility

- **Robots & Sitemap:** Next.js automatically generates `robots.txt` and `sitemap.xml` based on the App Router conventions. Custom sitemap logic (e.g., dynamically listing all product URLs) lives in `src/app/sitemap.ts`.
- **Force Dynamic:** Because SEO overrides can change at any time via the admin panel, all affected pages are exported with `export const dynamic = "force-dynamic"`. Caching was evaluated and explicitly rejected to ensure that admin changes immediately reflect on the live site without requiring a rebuild or encountering stale cache invalidation issues.
