import type { Metadata } from "next";
import { headers } from "next/headers";
import { BRAND } from "@/lib/brand";
import { SITE_SHARE_IMAGE, baseOpenGraph, siteDescription, siteOrganizationName, siteUrl } from "@/lib/site";

// The sign-in page is a client component, so its metadata lives here. It's
// the one page search engines may list (robots.ts), so it carries the full
// description, canonical link and structured data.
export function generateMetadata(): Metadata {
  const description = siteDescription();
  return {
    title: "Sign in",
    description,
    alternates: { canonical: "/login" },
    robots: { index: true, follow: true },
    openGraph: { ...baseOpenGraph(description), url: "/login", title: `Sign in · ${BRAND.fullName}` },
    twitter: { card: "summary_large_image", title: `Sign in · ${BRAND.fullName}`, description, images: [SITE_SHARE_IMAGE.url] },
  };
}

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const org = siteOrganizationName();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: BRAND.fullName,
    alternateName: BRAND.name,
    description: siteDescription(),
    url: new URL("/login", siteUrl()).toString(),
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Human resources information system",
    operatingSystem: "Web, Android, iOS, Windows, macOS",
    creator: { "@type": "Person", name: "Renz" },
    ...(org ? { provider: { "@type": "Organization", name: org } } : {}),
  };
  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        // JSON-LD is data, not code; `<` is escaped so no value can close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      {children}
    </>
  );
}
