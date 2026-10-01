---
name: new-module
description: How to add a new feature or module to EychAr end to end — domain model first, then service, validation, routes, UI, tests and docs, following AGENTS.md. Load before starting any new feature, entity, screen backed by data, or significant change to an existing domain.
---

# New module / feature (EychAr)

Model the business, don't hardcode it (AGENTS.md §2). Work in this order and don't start with React components (§6).

## 1. Decide the domain model (before code)
- Which domain owns it (`src/domains/<domain>/`)? What entities, relationships, ownership?
- Is it **configuration** (a catalog/policy HR edits) or a **transaction**? Configuration is data in Mongo, never constants in code. Country rules (e.g. Philippine holidays, statutory rates) go in a preset/rule module that *proposes* data HR saves (see `src/domains/holidays/presets/`).
- Does it change over time? Use effective dating (`effectiveFrom`/`effectiveTo`); history is never overwritten (§27). Historical transactions use the config valid on their date.
- Who may see/change it? Pick permission keys `<resource>.read|create|update`.
- If the choice is architectural, write `docs/architecture/adr/ADR-0NN-<name>.md` and update `ARCHITECTURE.md`.

## 2. Model (`src/server/db/models/<name>.ts`)
- Always `organizationId` (ref Organization). Indexes only for real queries, starting with `organizationId`.
- `status` field instead of deleting. Add `schema.plugin(hiddenPlugin)` so Super Admin "hide as test data" works; register the type in `src/domains/visibility/visibility-service.ts` if it should be hideable.
- Export from `src/server/db/models/index.ts`.

## 3. Service (`src/domains/<domain>/<name>-service.ts`)
- All business rules here. Every query filters by `organizationId`; every foreign id passes `assertInOrganization`.
- Throw typed errors from `@/shared/errors`; audit every change with `AuditService.record`.
- Pure helpers (formatting, calculations) in separate files so they're unit-testable and safe to import in client components.

## 4. Validation + routes
- zod schemas in `src/shared/validation/<domain>.ts` with `objectId()` for ids and `.max()` on text.
- Routes: follow the `new-api-route` skill.
- New permissions → `scripts/seed.ts` `BASELINE_PERMISSIONS`.

## 5. Page + UI
- Server component page: `getCurrentOrganization()`, then `hasPermission(...)` before loading data; show a plain "You don't have access…" message otherwise. Gate each section/query by its own permission.
- Add `export const metadata = { title: "…" }` and a nav entry in `src/components/shared/nav-links.tsx` if it's a top-level screen.
- Follow the `ui-standards` skill (dialogs, feedback, mobile).

## 6. Tests
- Domain tests (`tests/domains/<domain>/`): rules, effective dating, cross-organization refusal, audit.
- UI tests (`tests/app/`) for interactive components (jsdom + Testing Library).
- `tests/standards/mutation-feedback.test.ts` must keep passing (spinner + toast on every mutation).

## 7. Done means
- `npx tsc --noEmit`, `npm run lint`, `npm test` all clean; `npm run build` passes.
- `ARCHITECTURE.md` section updated; ADR if architectural; README if setup/env changed (`.env.local.example` for new env vars).
- Run the `security-checklist` skill over the change.
