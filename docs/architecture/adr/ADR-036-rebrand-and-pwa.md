# ADR-036: Product name in one place, and installable app (PWA)

## Status

Accepted

## Context

The product is **PCAS HRIS**, with the tagline "people, time and payroll". The name appears in the
app shell, page titles, the footer, the sign-in screen, exports and print reports. The app should
also be installable on phones and desktops.

## Decision

- **One brand module**, `src/lib/brand.ts` (`BRAND`, `BRAND_TITLE_TEMPLATE`), used by the UI
  (`BrandName`), metadata, exports (workbook creator), print reports, the authenticator issuer and
  the WebAuthn relying-party name. Organization names and logos remain organization data.
- **Stable identifiers**: the MFA secret-box key-derivation salt (`"pcas-hris"` in
  `src/server/auth/secret-box.ts`) must not change once two-step secrets are stored, since changing
  it would make every stored secret unreadable unless `MFA_ENCRYPTION_KEY` is set. Per-viewer
  browser keys use the `pcas-hris:` prefix; changing it resets those preferences once.
- **Page titles**: the root layout sets `title.template` (`"%s · PCAS HRIS"`); each page
  exports its own `metadata.title`.
- **PWA**: `src/app/manifest.ts`, icons, and a hand-written `public/sw.js` (no new dependency).
  The worker caches only fingerprinted static assets and icons and serves `public/offline.html`
  when a page can't load. It never caches pages or `/api` responses: they carry personal and
  payroll data and depend on who's signed in, and a cached page could show one person's data to the
  next user of a shared device. `/sw.js` is served `no-store` with `Service-Worker-Allowed: /`;
  the CSP gains `worker-src 'self'` and `manifest-src 'self'`. Registration runs in production
  builds only, so it never interferes with `next dev`.

## Consequences

- Offline use is limited to the offline page; the clock still needs a connection, which is
  correct because clocking in is verified on the server (ADR-020/026).
- Push notifications, background sync or offline drafts can be added to the same worker later
  without changing this caching rule.
