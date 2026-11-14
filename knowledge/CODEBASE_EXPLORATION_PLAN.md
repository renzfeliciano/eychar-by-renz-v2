# Codebase Exploration Plan

Purpose: a repeatable plan for building a knowledge base of this repository (PCAS HRIS) that later
tasks can load instead of re-exploring the code. The plan is the procedure; its output lives in
`knowledge/` (see [Output](#output)).

## Progress

| Phase | Status | Output |
|---|---|---|
| 0. Orientation | Done (2026-11-14) | [overview.md](./overview.md) |
| 1. Layers and boundaries | Done (2026-11-14) | [layers.md](./layers.md) |
| 2. Domain inventory | Done (2026-11-14; 23 domains) | [domains/](./domains/) |
| 3. Data model | Done (2026-11-14) | [data-model.md](./data-model.md) |
| 4. Authorization and identity | Done (2026-11-14) | [authorization.md](./authorization.md) |
| 5. Frontend and UI system | Done (2026-11-14) | [ui-patterns.md](./ui-patterns.md) |
| 6. Cross-cutting concerns | Done (2026-11-14) | [cross-cutting.md](./cross-cutting.md) |
| 7. Testing and verification | Done (2026-11-14) | [testing.md](./testing.md) |
| 8. Synthesis and gap report | Done (2026-11-14) | [README.md](./README.md), [known-gaps-and-mismatches.md](./known-gaps-and-mismatches.md) |

Open items from the build: the spot-check was thinner than Phase 8 asks for (see README); some
sub-agent claims are still unverified; `CHANGE_PROTOCOL.md` is in this folder but not from this build.

## 1. Scope and ground rules

- **Repo:** Next.js (App Router) + TypeScript + MongoDB HRIS. ~970 tracked files; ~200 pages under
  `src/app/(app)/`, ~50 route groups under `src/app/api/`, domain logic under `src/domains/`, shared
  code under `src/lib/`, tests under `tests/` (Vitest, plus Playwright e2e).
- **Existing sources of truth come first.** Do not re-derive what is already written down:
  - `README.md`: setup, scripts, deployment, cron jobs.
  - `ARCHITECTURE.md`: what is built, per phase, with ADR links; has a "Known gaps" section (line ~620).
  - `docs/ENGINEERING.md`: the binding engineering rules (architecture first, domain services,
    server vs client, authorization, transactions, testing, file quality).
  - `docs/architecture/adr/`: decisions, ADR-001 to ADR-053. Numbering has gaps (008, 021, 034, 051
    are absent); do not assume a gap is a missing file.
- **Code wins over docs.** Where an ADR or ARCHITECTURE section disagrees with the code, record the
  mismatch as a finding instead of silently picking one side.
- **Read, don't guess.** Every claim in the knowledge base cites a file path (and a symbol or line
  where useful). Claims without a citation are not knowledge.
- **Do not copy secrets.** `.env.local` exists in the working tree; never record its values.

## 2. Phases

Each phase has an exit condition. Finish a phase before starting the next, because later phases
depend on the vocabulary and the map built earlier.

### Phase 0: Orientation (inventory)
Goal: know the shape of the repo without reading source.
- List tracked files by top-level directory and count them.
- Read `package.json` (scripts, dependency versions), `next.config.ts`, `vercel.json`,
  `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`.
- Locate the actual folders (already done; see `overview.md`): models are in `src/server/db/models/`,
  shared components in `src/components/shared/`, primitives in `src/components/ui/`, server
  infrastructure in `src/server/`, Zod and error types in `src/shared/`, `src/proxy.ts` at the root of `src/`.
- Read the `ARCHITECTURE.md` section headings and "Known gaps" in full.
- **Exit:** a one-page map: stack, how to run, how to test, how CI gates a change.

### Phase 1: Layers and boundaries
Goal: how a request flows through the code.
- Read ENGINEERING.md §§ 4, 36–40 (architecture style, API architecture, Next.js structure,
  server vs client, middleware).
- Trace one representative write path end to end, e.g. `src/app/api/employees` →
  `src/domains/workforce/employee-service.ts` → Mongo models → audit. Note where validation,
  authorization, transactions and audit happen.
- Record the rule for each layer: what a route handler may do, what a domain service must do,
  what a client component may import.
- **Exit:** a layer diagram and a rule list, each rule tied to a file.

### Phase 2: Domain inventory
Goal: one entry per domain with its purpose, services, data and status.
Domains (from `src/domains/`, 23 folders): `assets`, `attendance`, `audit` (no tracked files; see
`overview.md` open question 3), `authorization`, `cases`, `catalog`, `clearance`, `dashboard`,
`deletion`, `documents`, `events`, `final-settlement`, `holidays`, `identity`, `leave`,
`organization`, `payroll` (incl. `engine/`, `templates/`), `people`, `performance`, `recruitment`,
`travel-orders`, `visibility`, `workforce`.
For each domain record:
- Purpose (one sentence), governing ADRs, and the ARCHITECTURE.md section.
- Service files and their exported entry points.
- Models it reads and writes (in `src/server/db/models/`).
- Routes that call it (`src/app/api/...`) and pages that use it (`src/app/(app)/...`).
- Tests that cover it (`tests/domains/...`, `tests/app/...`).
- Known gaps from ARCHITECTURE.md "Known gaps" that touch it.
- **Exit:** one knowledge file per domain, using the template in [Output](#output).

### Phase 3: Data model
Goal: the Mongo schema as the code defines it.
- Enumerate models and their key fields, indexes and references.
- Map which models are effective-dated (ADR-006), audited (ADR-007, § 35), soft-deleted / recycle bin
  (ADR-033), or org-scoped.
- Read `scripts/seed.ts` and `scripts/sync-indexes.ts` to see how reference data is created.
- **Exit:** `data-model.md`: entity list, relationships, and the invariants the code enforces.

### Phase 4: Authorization and identity
Goal: who can do what, and where that is enforced.
- Read ADR-007, ADR-023, ADR-039, ADR-043, ADR-010, ADR-030 and ENGINEERING.md §§ 19–24.
- Trace one permission check from a route handler to the visibility/authorization service.
- List the permission catalog (where it is defined) and the seeded roles.
- Confirm the super-admin special case (see recent commits `78b5311`) against the code.
- **Exit:** `authorization.md`: the permission model, the enforcement points, and the rule for
  adding a new permission.

### Phase 5: Frontend and UI system
Goal: how screens are built and kept consistent.
- Read ADR-013, ADR-048, ADR-050 and ENGINEERING.md §§ 23, 41.
- Inventory shared components (locate the folder in Phase 0), the design system folder (`design-system/`), and
  the navigation source (nav permissions are tested in `tests/app/nav-permissions.test.tsx`).
- Record the loading-state convention (`loading.tsx` per route), the table and export helpers
  (`src/lib/table-query.ts`, `src/lib/export/`), and the dialog/sheet pattern.
- **Exit:** `ui-patterns.md`: reusable building blocks and the conventions a new screen must follow.

### Phase 6: Cross-cutting concerns
Goal: the plumbing every feature relies on.
- Errors and field validation (`src/lib/field-errors.ts`, ENGINEERING.md § 48).
- Dates and time zones (`src/lib/app-time.ts`, `date-key.ts`, `employee-dates.ts`; Manila time in cron).
- Money and payroll math (`src/lib/money.ts`, `payroll-tax.ts`).
- Audit logging (`user-audit.ts`, ENGINEERING.md § 35).
- File and object storage (ADR-038, ENGINEERING.md § 43).
- Background jobs (`src/app/api/cron/*`, `vercel.json`, ENGINEERING.md § 44).
- Security hardening (ADR-037, ADR-040 security review, ADR-030 sign-in).
- PWA and service worker (`public/sw.js`, ADR-036).
- **Exit:** `cross-cutting.md`.

### Phase 7: Testing and verification
Goal: how to prove a change works.
- Read ENGINEERING.md §§ 46, 58–60 (domain, historical and authorization test requirements).
- Map test folders to domains; note domains with no test file.
- Record the commands (full table in `overview.md`): `npm run typecheck`, `npm run lint`, `npm test`
  (which is `test:ui` + `test:domains` + `test:core`), `npm run test:each`, `npm run test:e2e`, and the
  e2e seed (`scripts/seed-e2e.ts`, `tests/e2e/README.md`).
- Confirm whether e2e runs in CI (README says yes; `.github/workflows/ci.yml` has no e2e step).
- Test folders: `tests/app`, `tests/domains`, `tests/server`, `tests/lib`, `tests/security`,
  `tests/shared`, `tests/standards`, `tests/e2e`. Note `tests/standards` (button and mutation
  feedback rules) is a guard for UI conventions; check it in Phase 5.
- **Exit:** `testing.md`: commands, test map, coverage gaps.

### Phase 8: Synthesis and gap report
Goal: make the knowledge usable.
- Write the index (`knowledge/README.md`) that links every file and says when to read it.
- Write `known-gaps-and-mismatches.md`: doc-vs-code disagreements, untested domains, and anything
  from ARCHITECTURE.md "Known gaps" that is still open.
- Spot-check five random claims per file against the source. Fix or delete any that fail.
- **Exit:** the index links resolve, and the spot-check is recorded at the bottom of the index.

## 3. How to run it

- Phases are sequential, but within a phase independent reads can run in parallel (e.g., one
  reader per domain in Phase 2). Use read-only exploration agents for broad sweeps and read the
  key files yourself for anything that will be written into the knowledge base.
- Keep each knowledge file under roughly 300 lines. Split a domain if it grows past that.
- Re-run a phase when the code changes materially. Record the git commit the knowledge was built
  from at the top of the index, so staleness is visible.
- Write knowledge incrementally: after each phase, save its files before starting the next one.

## 4. Output

All output goes under `knowledge/` (a top-level folder, separate from `docs/`):

```
knowledge/
  CODEBASE_EXPLORATION_PLAN.md    this plan
  README.md                       index, build commit, spot-check results
  overview.md                     stack, run/test commands, CI gates        (Phase 0)
  layers.md                       request flow and layer rules              (Phase 1)
  domains/<domain>.md             one file per domain                       (Phase 2)
  data-model.md                   entities, relations, invariants           (Phase 3)
  authorization.md                permissions, enforcement, how to extend   (Phase 4)
  ui-patterns.md                  components and screen conventions         (Phase 5)
  cross-cutting.md                errors, dates, money, audit, storage, jobs (Phase 6)
  testing.md                      commands, test map, gaps                  (Phase 7)
  known-gaps-and-mismatches.md    open issues and doc/code disagreements    (Phase 8)
```

Domain file template (`domains/<domain>.md`):

```markdown
# <Domain name>

**Purpose:** one sentence.
**Governing docs:** ADR-0xx, ARCHITECTURE.md § <section>, ENGINEERING.md § <n>.
**Services:** `path` — exported functions it provides.
**Models:** names and file paths.
**Routes:** `src/app/api/...` list.
**Pages:** `src/app/(app)/...` list.
**Tests:** file list, or "none".
**Rules a change must respect:** bullets, each with a file citation.
**Known gaps / mismatches:** bullets or "none found".
**Last verified:** <git short hash>.
```

## 5. How later tasks use this

1. Read `knowledge/README.md` first, then only the files the task touches.
2. Before relying on a claim, open the cited file. The knowledge is a map, not a substitute for
   reading code you are about to change.
3. If a task changes a domain, update its knowledge file in the same change, and bump
   "Last verified".
4. If exploration finds something the knowledge base gets wrong, fix the file rather than working
   around it.

## 6. Done criteria

- Every file in the output tree exists, or is listed in the index as deliberately skipped with a reason.
- Every domain in `src/domains/` has a knowledge file.
- The index records the build commit and the spot-check results.
- No secret values appear anywhere in the output.
