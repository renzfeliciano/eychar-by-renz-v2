# Overview (Phase 0)

**Built from commit:** `6587050` (main, 2026-11-09). **Verified:** 2026-11-14.
**Scope:** orientation only. Layers, domains and data are in later files.

## What it is

PCAS HRIS: a configurable, mobile-first HRIS for Project Concepts and Administrative Services, Inc.
Modular monolith (ADR-001). Next.js App Router, TypeScript, MongoDB via Mongoose, Auth.js (next-auth v4),
Zod, shadcn/ui-style components, deployed on Vercel. Installs as a PWA.
Sources: `README.md`, `ARCHITECTURE.md` (Architecture style, Status).

## Stack (from `package.json`)

| Concern | Choice |
|---|---|
| Framework | `next` 16.3.8, `react`/`react-dom` 19.2.8 |
| Data | `mongoose` ^9.9.4, `mongodb` ^6.20 |
| Auth | `next-auth` ^4.24 (ADR-042 stays on v4), `argon2`, `@simplewebauthn/*` (biometric clock-in, ADR-020) |
| Validation | `zod` ^4.5 |
| UI | `@base-ui/react`, `lucide-react`, `sonner`, `next-themes`, `tailwindcss` ^4, `class-variance-authority`, `shadcn` |
| Files / export | `@vercel/blob`, `exceljs` 4.4.0, `qrcode` |
| Liveness | `@mediapipe/tasks-vision` 1.0.1 (WASM copied at build by `scripts/copy-mediapipe-wasm.mjs`) |
| Tests | `vitest` ^3.2, `@testing-library/*`, `jsdom`, `mongodb-memory-server`, `@playwright/test` |
| Language | TypeScript ^5, `tsx` for scripts |

Node 22 in CI (`.github/workflows/ci.yml`).

## Commands (from `package.json`)

| Purpose | Command |
|---|---|
| Dev server (port 4100) | `npm run dev` (runs `predev` mediapipe copy first) |
| Build / start | `npm run build` / `npm run start` |
| Lint | `npm run lint` (ESLint 9, `eslint-config-next`) |
| Typecheck | `npm run typecheck` (`next typegen && tsc --noEmit`) |
| All unit/integration tests | `npm test` = `test:ui` + `test:domains` + `test:core` |
| One group | `test:ui` → `tests/app`; `test:domains` → `tests/domains`; `test:core` → `tests/server tests/security tests/lib tests/shared tests/standards` |
| Single test file/folder | `npm run test:each` (`scripts/test-each.mjs`), or `npx vitest run <path>` |
| End-to-end | `npm run test:e2e` (Playwright, production build on port 4200, throwaway DB `E2E_MONGODB_URI`) |
| Seed reference data | `npm run db:seed` (`scripts/seed.ts`, idempotent, reads `SEED_*` env) |

## Gates

- **Pre-commit** (`.husky/pre-commit`): lint + typecheck only.
- **CI** (`.github/workflows/ci.yml`, push to `main` and PRs): lint, typecheck, `npm test`, build.
  e2e is noted in README as also running in CI after those pass, but the current `ci.yml` has no
  e2e step. Treat this as a mismatch to confirm (see `known-gaps-and-mismatches.md` once written).

## Configuration and environment

- `.env.local.example` is the template; `.env.local` exists in the working tree and is git-ignored.
  Never record its values.
- `next.config.ts`: security headers (nosniff, X-Frame-Options DENY, Permissions-Policy,
  HSTS in production, COOP). CSP is per request with a nonce in `src/proxy.ts` (see `layers.md`).
- `vercel.json` crons: `/api/cron/payroll-schedules` at 16:05 UTC (00:05 Manila), `/api/cron/recycle-bin`
  at 17:20 UTC (01:20 Manila).
- `vitest.config.ts` forces `TZ=UTC`, runs one shared in-memory MongoDB (`tests/global-setup.ts`),
  and serializes files (`fileParallelism: false`). Test timeout 15 s.

## Top-level layout (tracked files: 969; counts verified with `git ls-files`)

| Path | Contents | Tracked files |
|---|---|---|
| `src/app/` | App Router. Route groups: `(app)` (authenticated shell, 202 files), `(auth)` (login, change password, two-step), `(self-service)` (clock). `_shared/` helpers (accessible-projects, get-current-organization, has-permission, is-super-admin, get-self-service-session, file-response). `api/` has 43 route folders. | 349 |
| `src/domains/` | Domain services, 23 folders (see below) | 132 |
| `src/server/` | Infrastructure: `db/` (63 Mongoose models in `db/models/`, plus `index.ts`, `simple-catalog-schema.ts`, connection and helpers), `auth/` (9), `authorization/`, `audit/`, `security/`, `storage/`, `policies/` | 94 |
| `src/components/` | `ui/` (17 shadcn-style primitives), `shared/` (44 shared components, e.g. PageHeader, DataTable) | 61 |
| `src/shared/` | Zod validation (`validation/`, 27 files), error types (`errors/`), shared TS types, `slugify.ts` | 32 |
| `src/lib/` | Client/server helpers: dates (`app-time.ts`, `date-key.ts`), money, CSV, export, table query, liveness, field errors | 21 |
| `src/proxy.ts` | Request proxy (CSP nonce per request) | 1 |
| `tests/` | `app` (41, UI), `domains` (100), `server` (18), `lib` (9), `security` (3), `shared` (3), `standards` (2), `e2e` (8, Playwright), `setup.ts`, `global-setup.ts` | 186 |
| `scripts/` | seed, e2e seed, index sync, holiday backfill, attendance photo migration, mediapipe copy, test-each | 7 |
| `docs/` | `ENGINEERING.md` and `architecture/adr/` (ADR-001 to ADR-053, with gaps) | 50+ |
| `public/` | PWA icons, service worker `sw.js`, offline page, login backgrounds, MediaPipe model | — |
| `design-system/workforcehub/pages/` | **Empty directory**, no tracked files. Nothing in the docs explains it. | 0 |

Note: `ARCHITECTURE.md` lists the `src/` tree as `app`, `components`, `domains`, `server`, `shared`.
It doesn't mention `src/lib/` or `src/proxy.ts`. Check whether that is a documentation gap in Phase 1.

## Domains (`src/domains/`, 23 folders, 132 tracked files)

`assets`, `attendance` (15), `audit` (**no tracked files**), `authorization` (3), `cases` (2),
`catalog` (16), `clearance` (4), `dashboard` (4), `deletion` (2), `documents` (2), `events` (4),
`final-settlement` (2), `holidays` (7, incl. `presets/`), `identity` (13), `leave` (4),
`organization` (5), `payroll` (20, incl. `engine/` and `templates/`), `people` (2), `performance` (9),
`recruitment` (3), `travel-orders` (2), `visibility` (1), `workforce` (11).

## Known gaps (copied from ARCHITECTURE.md, to be expanded in `known-gaps-and-mismatches.md`)

- Holidays don't drive pay or attendance; holiday permissions reuse `attendance.*`.
- Eid'l Fitr and future proclamations aren't built in.
- Two-step verification is per account type (ADR-039), not per role.
- Project scope covers attendance, projects and payroll runs only (ADR-043).
- Catalog `isClosed` / `isHired` flags are API-only (ADR-045).
- Concurrency tests need a real replica set.
- No admin UI to revoke one WebAuthn credential.

## Open questions for Phase 1

1. Is the e2e suite run in CI? (README says yes; `ci.yml` has no e2e step.)
2. What is `design-system/workforcehub/pages/` for, and is it used? (Empty, undocumented.)
3. `src/domains/audit/` exists as a folder but has no tracked files. Is it an empty leftover, or
   are its files untracked? (Check `git status` and the audit code under `src/server/audit/`.)
4. Why does `ARCHITECTURE.md`'s directory tree omit `src/lib/` and `src/proxy.ts`?
