# Cases (legal and administrative case register)

**Purpose:** Register of legal, labor and regulatory matters, each tied to a Project (site) rather than an employee, with catalog-driven classification and status, and open, closed and stale logic for the dashboard.
**Governing docs:** ADR-018 (case monitoring mirrors the legacy app's schema); ARCHITECTURE.md § Case monitoring (Phase 8c, ADR-018); ADR-045 (catalog meaning is data); ENGINEERING.md § 53 (cited by ARCHITECTURE.md for no hard deletes; see gaps).

**Services:**
- `src/domains/cases/case-service.ts`: `CaseService`
  - `create(input, actor)`: validates project, classification and status, creates the case, audits `case.created`.
  - `update(id, orgId, patch, actor)`: full replace (same schema as create), audits `case.updated` with classification and status before/after.
  - `listCurrent(orgId)`, `getById(id, orgId)`.
  - Private `assertReferencesValid`: project must belong to the org; classification and status go through the catalog services.
- `src/domains/cases/case-summary.ts`: `LEGACY_CLOSED_CASE_CODES`, `closedCaseCodes` (from the catalog flag), `CASE_STALE_DAYS` (90), `isOpenCase`, `isStaleCase`, `summarizeCases`, `filterCasesByView`.

**Models:**
- `src/server/db/models/case.ts` (`Case`; indexes `{ organizationId, status }` line 25 and `{ projectId }` line 26).
- `src/server/db/models/case-classification.ts`, `src/server/db/models/case-status.ts` (catalogs).
- `Project`: `src/server/db/models/project.ts`.

**Routes:**
- `src/app/api/cases/route.ts`: GET (`cases.read`), POST (`cases.create`).
- `src/app/api/cases/[id]/route.ts`: PATCH (`cases.update`). No DELETE.
- Catalog management for `case-classifications` and `case-statuses` is under `src/app/api/catalogs/[type]/` (see catalog file).

**Pages:**
- `src/app/(app)/cases/page.tsx` (gated by `cases.read`; create and update flags via `hasPermission`), with `case-detail-sheet.tsx`, `case-form-dialog.tsx`, `case-export-actions.tsx`, `case-print-report.tsx`, `loading.tsx`.
- `src/app/(app)/dashboard/page.tsx` reads `CaseService.listCurrent` and `CaseStatusService` (lines 16-18, 174) to count open cases.

**Tests:** `tests/domains/cases/case-service.test.ts`, `tests/domains/cases/case-summary.test.ts`, `tests/app/case-detail-sheet.test.tsx`.

**Rules a change must respect:**
- Classification and status must be active catalog codes once the catalog has any item; with no catalog items any code is accepted (`simple-catalog-service.ts` `assertValidCode`, lines 157-168; called from `case-service.ts` lines 108-109).
- Open or closed is decided by the status catalog's `isClosed` metadata flag. Legacy codes (`dismissed`, `closed`, `resolved`, `settled`) apply only where no flag is set (`case-summary.ts` lines 18-33; `catalog-flags.ts` `codesWithFlag`). Do not hard-code status codes.
- A case is stale when it is open and has had no update for `CASE_STALE_DAYS` (90) (`case-summary.ts` lines 26 and 51).
- Update is a full replace; the audit records only classification and status before/after (`case-service.ts` lines 152-170).
- Every read and write filters by `organizationId` (`case-service.ts` lines 144-146 and 182-184).
- Cases are org-wide. They are not project-scoped even though each case has a project; the route uses `cases.*` without a project check (consistent with ADR-043, which excludes cases).
- Retire a case through its status, not by deleting it.

**Known gaps / mismatches:**
- **`isClosed` cannot be changed after creation.** The catalog create route accepts `metadata` (`src/shared/validation/catalog.ts` line 11), but the PATCH route and `simple-catalog-service.ts` `update` only change name and description, and `updateStatus` only changes status. So a status's `isClosed` flag is fixed when the item is created. ARCHITECTURE.md's Known gaps says flags "can only be set through the catalog API"; the code is narrower. See catalog file.
- **Citation mismatch.** ARCHITECTURE.md § Case monitoring cites ENGINEERING.md § 53 for "no hard deletes". § 53 is about database safety (do not delete existing data casually), not a delete ban.
- **Export is not audited** (`case-export-actions.tsx`; see audit file).
- Project reassignment through `update` (`projectId` in the patch) is allowed for anyone with `cases.update`, with no project-scope check.

**Last verified:** 6587050.
