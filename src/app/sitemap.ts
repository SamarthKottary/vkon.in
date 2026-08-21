import type { MetadataRoute } from "next";
import { site } from "@/content/site";
import { listProducts } from "@/lib/db/products";

/** Built from the live catalogue on each request. */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const products = await listProducts();

  const staticRoutes = [
    { path: "/", priority: 1 },
    { path: "/products", priority: 0.9 },
    /* /protection is deliberately absent from the header — the hero's Explore
       button is its only link. That makes the sitemap the only thing telling a
       crawler the page exists, so this entry is load-bearing, not routine. */
    { path: "/protection", priority: 0.8 },
    { path: "/about", priority: 0.7 },
    { path: "/contact", priority: 0.7 },
  ];

  return [
    ...staticRoutes.map((route) => ({
      url: `${site.url}${route.path}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: route.priority,
    })),
    ...products.map((product) => ({
      url: `${site.url}/products/${product.slug}`,
      lastModified: new Date(product.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
