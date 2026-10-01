# EychAr by Renz

**EychAr** /eɪtʃ ɑːr/ · people, time and payroll

Say it "aitch-ar", like H·R. EychAr is a configurable, mobile-first HRIS: people records,
attendance and the self-service clock, monthly schedules with a holiday calendar, leave, payroll,
clearance and final settlement, recruitment, performance, cases, travel orders, assets, documents
and events. It installs as an app on phones and desktops (PWA).

See [AGENTS.md](./AGENTS.md) for the full engineering instructions and
[ARCHITECTURE.md](./ARCHITECTURE.md) for what's built and why (decisions are in
[docs/architecture/adr](./docs/architecture/adr)).

> The repository folder is still named `hris-workforcehub`; the product was renamed from
> WorkforceHub to EychAr by Renz (ADR-036). Brand strings live in one place:
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
- `npm run db:seed` — idempotent: seeds the initial organization, permission catalog, HR
  Administrator role, and HR user from `SEED_*` env vars

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
