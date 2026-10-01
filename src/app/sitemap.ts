import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Only the public sign-in page; everything else needs an account (see robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: new URL("/login", siteUrl()).toString(), changeFrequency: "monthly", priority: 1 }];
}
