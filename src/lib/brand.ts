/**
 * The product's own name and lines, in one place. An organization's name
 * and logo come from its own data and never belong here.
 */
export const BRAND = {
  /** The wordmark. */
  name: "PCAS HRIS",
  fullName: "PCAS HRIS",
  tagline: "people, time and payroll",
  description:
    "PCAS HRIS: people, time and payroll in one configurable, mobile-first HRIS.",
  /** Short name for home-screen icons and authenticator apps. */
  shortName: "PCAS HRIS",
  /** Prefix for this app's per-viewer browser storage keys. */
  storagePrefix: "pcas-hris",
} as const;

/** "Schedules · PCAS HRIS", for document titles. */
export const BRAND_TITLE_TEMPLATE = `%s · ${BRAND.fullName}`;
