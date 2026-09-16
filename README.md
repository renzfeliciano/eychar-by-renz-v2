# hris-workforcehub

Configurable, mobile-first HRIS platform. See [AGENTS.md](./AGENTS.md) for the full engineering
instructions and [ARCHITECTURE.md](./ARCHITECTURE.md) for the current implementation status
(Phase 1 — Foundation).

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
