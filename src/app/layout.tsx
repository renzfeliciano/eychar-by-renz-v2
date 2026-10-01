import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/shared/providers";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/shared/service-worker-register";
import { BRAND, BRAND_PRONUNCIATION_TAGLINE, BRAND_TITLE_TEMPLATE } from "@/lib/brand";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: BRAND.fullName, template: BRAND_TITLE_TEMPLATE },
  description: BRAND_PRONUNCIATION_TAGLINE,
  applicationName: BRAND.fullName,
  // Installed on iOS: full-screen, with its own home-screen name.
  appleWebApp: { capable: true, title: BRAND.shortName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // next-themes sets the "dark"/"light" class and color-scheme style on
    // <html> from an inline script before React hydrates, so this element's
    // attributes will always legitimately differ from the server-rendered
    // markup — suppressHydrationWarning is next-themes' own documented fix,
    // not a workaround for a real bug.
    <html lang="en" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <body>
        <Providers>
          {children}
          <Toaster />
        </Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
