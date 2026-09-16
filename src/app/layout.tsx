import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/shared/providers";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "WorkforceHub HRIS",
  description: "Configurable HRIS platform",
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
      </body>
    </html>
  );
}
