import { BRAND } from "./brand";

/**
 * The public address of this deployment, for canonical links, the sitemap
 * and share previews. NEXT_PUBLIC_SITE_URL wins; otherwise the Auth.js URL,
 * then Vercel's production domain, then local dev.
 */
export function siteUrl(): URL {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    "http://localhost:4100";
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:4100");
  }
}

/**
 * The organization this deployment serves, for search and share text. It's
 * deployment configuration (SITE_ORGANIZATION_NAME), never hardcoded; empty
 * means the text stays generic.
 */
export function siteOrganizationName(): string | null {
  return process.env.SITE_ORGANIZATION_NAME?.trim() || null;
}

/** The search/share description of the sign-in page (kept near the ~160 characters search results show). */
export function siteDescription(): string {
  const org = siteOrganizationName()?.replace(/\.+$/, "");
  return `${BRAND.fullName}: people, time and payroll${org ? ` for ${org}` : ""}. Employee records, attendance, schedules, leave and payroll in one place.`;
}

export const SITE_KEYWORDS = [
  "EychAr",
  "EychAr by Renz",
  "HRIS",
  "HR system",
  "human resources",
  "payroll",
  "attendance",
  "employee schedules",
  "leave management",
  "Philippines HRIS",
];

/** The share-preview image (public/og/eychar-share.png), 1200×630. */
export const SITE_SHARE_IMAGE = { url: "/og/eychar-share.png", width: 1200, height: 630, alt: `${BRAND.fullName}: people, time and payroll` };

/**
 * Open Graph fields every page shares. A page that sets its own openGraph
 * replaces the parent's whole object (Next.js merges metadata shallowly), so
 * pages spread this in rather than repeating it.
 */
export function baseOpenGraph(description: string) {
  return { type: "website" as const, siteName: BRAND.fullName, locale: "en_PH", description, images: [SITE_SHARE_IMAGE] };
}
