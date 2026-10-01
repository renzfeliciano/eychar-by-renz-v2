import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * Search engines may show the sign-in page and nothing else: every other
 * page is behind sign-in and holds personal data. Private pages also send
 * `noindex` themselves (the (app), (self-service) and change-password
 * layouts), and /api responses carry X-Robots-Tag, so a stray link can't
 * get them listed either.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/$", "/login", "/og/", "/icon", "/apple-icon", "/icons/", "/manifest.webmanifest"],
        disallow: "/",
      },
    ],
    sitemap: new URL("/sitemap.xml", base).toString(),
    host: base.origin,
  };
}
