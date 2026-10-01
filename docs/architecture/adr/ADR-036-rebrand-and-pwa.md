# ADR-036: Rebrand to "EychAr by Renz" and installable app (PWA)

## Status

Accepted

## Context

The product was renamed from WorkforceHub to **EychAr by Renz**, with the tagline
"EychAr /eɪtʃ ɑːr/ · people, time and payroll", across the app name, page titles, the footer and
the sign-in screen. The app should also be installable on phones and desktops.

## Decision

- **One brand module**, `src/lib/brand.ts` (`BRAND`, `BRAND_PRONUNCIATION_TAGLINE`,
  `BRAND_TITLE_TEMPLATE`), used by the UI (`BrandName`), metadata, exports (workbook creator),
  print reports, the authenticator issuer and WebAuthn relying-party name. This is the platform's
  brand; customer names and logos remain organization data.
- **Kept on purpose**: the MFA secret-box key-derivation salt (`"workforcehub"` in
  `src/server/auth/secret-box.ts`), since changing it would make every stored two-step secret
  unreadable; "workforcehub" stays on the weak-password list. Accounts that set up two-step
  verification before the rename keep the old label in their authenticator app until they set it
  up again; their codes still work. Per-viewer browser keys moved to the `eychar:` prefix, so
  sidebar preferences reset once. The repository folder keeps its name.
- **Page titles**: the root layout sets `title.template` (`"%s · EychAr by Renz"`); each page
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
