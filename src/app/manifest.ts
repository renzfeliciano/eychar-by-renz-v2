import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/**
 * Makes the app installable (home screen / desktop app). Served at
 * /manifest.webmanifest and linked from every page by Next.js. "/" sends
 * each person where they belong after sign-in (dashboard or the clock).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: BRAND.fullName,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f5f6fa",
    theme_color: "#155dfc",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Clock in or out", short_name: "Clock", url: "/clock", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Schedules", url: "/attendance/schedules", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "People", url: "/people", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
