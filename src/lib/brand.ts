/**
 * The product's own name and lines, in one place. This is the platform's
 * brand (the software), not the customer's: an organization's name and logo
 * come from its own data and never belong here.
 */
export const BRAND = {
  /** The wordmark. Say it "aitch-ar", like H·R. */
  name: "EychAr",
  byline: "",
  fullName: "EychAr",
  /** IPA, shown beside the name wherever there's room for a tagline. */
  pronunciation: "/eɪtʃ ɑːr/",
  tagline: "people, time and payroll",
  description:
    "EychAr: people, time and payroll in one configurable, mobile-first HRIS.",
  /** Short name for home-screen icons and authenticator apps (no spaces to wrap). */
  shortName: "EychAr",
  /** Prefix for this app's per-viewer browser storage keys. */
  storagePrefix: "eychar",
} as const;

/** "EychAr /eɪtʃ ɑːr/ · people, time and payroll" */
export const BRAND_PRONUNCIATION_TAGLINE = `${BRAND.name} ${BRAND.pronunciation} · ${BRAND.tagline}`;

/** "Schedules · EychAr", for document titles. */
export const BRAND_TITLE_TEMPLATE = `%s · ${BRAND.fullName}`;
