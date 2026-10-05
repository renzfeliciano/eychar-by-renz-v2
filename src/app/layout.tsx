import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { IBM_Plex_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/shared/providers";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/shared/service-worker-register";
import { BRAND, BRAND_TITLE_TEMPLATE } from "@/lib/brand";
import { SITE_KEYWORDS, SITE_SHARE_IMAGE, baseOpenGraph, siteDescription, siteUrl } from "@/lib/site";

// One family for the whole product (ADR-048): IBM Plex Sans reads like a
// well-set form, has true tabular figures for pay and hours, and isn't the
// default every template ships with.
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

export function generateMetadata(): Metadata {
  const description = siteDescription();
  return {
    metadataBase: siteUrl(),
    title: { default: BRAND.fullName, template: BRAND_TITLE_TEMPLATE },
    description,
    applicationName: BRAND.fullName,
    keywords: SITE_KEYWORDS,
    authors: [{ name: "Renz" }],
    creator: "Renz",
    category: "business",
    // Share previews (Messenger, Viber, Slack, LinkedIn, X).
    openGraph: { ...baseOpenGraph(description), title: BRAND.fullName, url: "/" },
    twitter: { card: "summary_large_image", title: BRAND.fullName, description, images: [SITE_SHARE_IMAGE.url] },
    // Installed on iOS: full-screen, with its own home-screen name.
    appleWebApp: { capable: true, title: BRAND.shortName, statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1118" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The per-request CSP nonce from src/proxy.ts. Reading request headers also
  // keeps every page dynamically rendered, which a nonce requires (a page
  // built ahead of time would carry no nonce and its scripts would be blocked).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // next-themes sets the "dark"/"light" class and color-scheme style on
    // <html> from an inline script before React hydrates, so this element's
    // attributes will always legitimately differ from the server-rendered
    // markup — suppressHydrationWarning is next-themes' own documented fix,
    // not a workaround for a real bug.
    <html lang="en" className={cn("font-sans", plexSans.variable)} suppressHydrationWarning>
      <body>
        <Providers nonce={nonce}>
          {children}
          <Toaster />
        </Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
