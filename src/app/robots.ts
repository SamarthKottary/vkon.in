import type { MetadataRoute } from "next";
import { site } from "@/content/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // The admin is behind a login, but there is no reason for it to be crawled.
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/admin/", "/api/"] },
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
