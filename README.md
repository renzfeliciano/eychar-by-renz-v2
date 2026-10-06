# EychAr

**EychAr** /eɪtʃ ɑːr/ · people, time and payroll

Say it "aitch-ar", like H·R. EychAr is a configurable, mobile-first HRIS: people records,
attendance and the self-service clock, monthly schedules with a holiday calendar, leave, payroll,
clearance and final settlement, recruitment, performance, cases, travel orders, assets, documents
and events. It installs as an app on phones and desktops (PWA).

See [AGENTS.md](./AGENTS.md) for the full engineering instructions and
[ARCHITECTURE.md](./ARCHITECTURE.md) for what's built and why (decisions are in
[docs/architecture/adr](./docs/architecture/adr)).

> The repository is `eychar-by-renz-v2` (formerly `hris-workforcehub`); the product was renamed from
> WorkforceHub to EychAr (ADR-036). Brand strings live in one place:
> [`src/lib/brand.ts`](./src/lib/brand.ts).

## Getting started

```bash
npm install
cp .env.local.example .env.local
# fill in MONGODB_URI (a database dedicated to this project), NEXTAUTH_SECRET,
# and the SEED_* values, then:
npm run db:seed
npm run dev
```

The app runs on http://localhost:4100.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` / `npm run start` — production build and start
- `npm run typecheck` — `next typegen` + `tsc --noEmit`
- `npm run lint` — ESLint
- `npm test` — Vitest (uses an in-memory MongoDB; no `MONGODB_URI` needed)
- `npm run test:e2e` — Playwright end-to-end tests against a throwaway database; one-command setup
  with `npx tsx scripts/seed-e2e.ts` (see `tests/e2e/README.md`)
- The pre-commit hook runs lint and typecheck only; the full test suite and build run in
  GitHub Actions (`.github/workflows/ci.yml`) on every push to `main` and every pull request; the
  end-to-end tests run there too, after those pass, against a MongoDB replica set
- `npm run db:seed` — idempotent: seeds the initial organization, permission catalog, HR
  Administrator role, and HR user from `SEED_*` env vars

## Deploying on Vercel

- **Scheduled jobs:** `vercel.json` runs `/api/cron/payroll-schedules` daily at 00:05 Manila time and
  `/api/cron/recycle-bin` daily at 01:20 Manila time (Hobby plans allow daily jobs). Set
  `CRON_SECRET` in the project's environment variables; Vercel sends it with each run.
- **Document files:** connect a Blob store (Storage › Blob) so employee documents are kept in private
  object storage instead of the database (ADR-038). Without one they stay in MongoDB. Uploads are
  limited to 4MB.
- **Clock-in photos** go to the same Blob store (ADR-044). To move photos already in the database:
  `npx tsx scripts/migrate-attendance-photos.ts` (dry run), then add `--apply`.
- **Indexes:** production doesn't build indexes at runtime. After a deploy that adds or changes an
  index, run `npx tsx scripts/sync-indexes.ts` with the production `MONGODB_URI` (create-only).

## Holiday calendar

Each organization keeps its own holidays (Attendance › Schedules › **Holidays**). "Load Philippine
holidays" proposes a year's list, which HR reviews before saving: 2026 is checked against
Proclamation No. 1006, s. 2025 (plus Proclamation No. 1264, s. 2026 for Eid'l Adha); other years
use the standard dates by law and are flagged to check against that year's proclamation. Click any
date on the schedule to see its holidays, who's working, company events and HR's note (ADR-035).

## Installing as an app (PWA)

The app ships a web app manifest (`src/app/manifest.ts`), icons (`public/icons`) and a service
worker (`public/sw.js`, registered in production builds only). Over HTTPS, browsers offer
**Install** (Chrome/Edge) or **Add to Home Screen** (Safari on iOS). The service worker caches
only static build assets and icons and shows `public/offline.html` when there's no connection; it
never caches pages or API responses, since those hold personal data (ADR-036). To test locally,
run `npm run build && npm run start`; `next dev` doesn't register the worker.

## Search engines and link previews (SEO)

Only the sign-in page is meant to appear in search; everything else is behind sign-in and holds
personal data. `src/app/robots.ts` allows `/login` and blocks the rest, `src/app/sitemap.ts` lists
`/login`, the signed-in layouts send `noindex`, and `/api` responses carry `X-Robots-Tag: noindex`.
The sign-in page has a full description, canonical link, JSON-LD (`WebApplication`) and a share
image (`public/og/eychar-share.png`), so links pasted into Messenger, Viber, Slack or LinkedIn show
a proper card. Set `NEXT_PUBLIC_SITE_URL` (your real domain) and, optionally,
`SITE_ORGANIZATION_NAME` in Vercel; then submit `https://<your-domain>/sitemap.xml` in Google
Search Console.

## Security

See [ADR-037](./docs/architecture/adr/ADR-037-security-hardening.md) for the current hardening.
Optional settings: `SESSION_MAX_HOURS` (absolute session lifetime, default 12) and
`TRUSTED_PROXY_HOPS` (extra proxies in front of the host that append to `X-Forwarded-For`,
default 0). Set `MFA_ENCRYPTION_KEY` in production. The Super Administrator can require two-step
verification for every HR and admin account under Settings › Security (ADR-039); self-service
employee accounts are exempt. Pages send a per-request nonce
Content-Security-Policy in production builds only, so `next dev` is unaffected.
