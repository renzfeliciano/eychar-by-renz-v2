# Clearance (separation offboarding)

**Purpose:** One clearance case per separating employee, with a checklist copied per department, blocking items, automatic checks (issued assets, active accounts, travel orders), and a derived "cleared" status that gates final settlement.
**Governing docs:** ADR-031 (workforce clearance, primary); ADR-032 (final settlement consumes the cleared status); ADR-053 is unrelated (probation evaluations). ARCHITECTURE.md has no Clearance section; it appears only under § Dashboard (line 615). ENGINEERING.md § 33 (transactions), § 35 (audit), § 37 (domain services).

**Services** (`src/domains/clearance/`):
- `clearance-service.ts`: `ClearanceService`
  - `open(input, actor)`: one active case per employee; copies active checklist items; then runs automatic sync.
  - `getById`, `listForOrganization` (with employee name and separation type name).
  - `actOnItem(caseId, orgId, itemId, input, actor)`: clear, flag, waive, not_applicable, reopen.
  - `sourceFacts(orgId, employeeId, now)`: what the automatic checks see right now.
  - `syncAutomaticItems(caseId, orgId)`: clears pending auto items whose facts are now satisfied.
  - `cancel(caseId, orgId, { reason }, actor)`.
  - Private: `requireCase`, `assertNotSelf`, `nextCaseNumber` (`CLR-YYYY-NNNN`).
- `clearance-checklist-service.ts`: `ClearanceChecklistService`: `create`, `listCurrent`, `update`.
- `clearance-sources.ts`: `CLEARANCE_AUTO_SOURCES` (`assets`, `account_access`, `travel_orders`), `evaluateSource`.
- `clearance-summary.ts`: `isItemResolved`, `isItemOverdue`, `deriveCaseStatus`, `caseProgress`, `summarizeClearances`.
- Depends on `ClearanceDepartmentService`, `SeparationTypeService` (catalogs), `travelTiming` (travel-orders domain), `formatPersonName`.

**Models** (`src/server/db/models/`): `clearance-case.ts` (`ClearanceCase`; unique `{ organizationId, caseNumber }` line 50; partial unique `{ organizationId, employeeId }` where `active: true`, line 51), `clearance-checklist-item.ts`, `clearance-department.ts`, `separation-type.ts`. Reads `AssetIssuance`, `TravelOrder`, `User`, `Employee`, `Person`.

**Routes** (`src/app/api/clearance/`):
- `route.ts`: POST (`clearance.create`).
- `[id]/route.ts`: PATCH (`clearance.update`, cancel).
- `[id]/items/[itemId]/route.ts`: POST. `waive` needs `clearance.waive`; every other action needs `clearance.sign-off`.
- `checklist/route.ts`: POST (`clearance.update`). `checklist/[id]/route.ts`: PATCH (`clearance.update`).
- The list and detail pages call the service directly; there is no GET route.

**Pages:**
- `src/app/(app)/clearance/page.tsx` (gated by `clearance.read`), with `open-clearance-dialog.tsx`, `checklist-dialog.tsx`, `clearance-labels.ts`.
- `src/app/(app)/clearance/[id]/page.tsx` with `clearance-item-actions.tsx`, `cancel-clearance-button.tsx`.

**Tests:** `tests/domains/clearance/clearance-service.test.ts`, `clearance-sources.test.ts`, `clearance-summary.test.ts`; `tests/app/clearance-dialogs.test.tsx`. `clearance-checklist-service.ts` has no test of its own (referenced by two test files).

**Rules a change must respect:**
- One active clearance per employee: partial unique index (`clearance-case.ts` line 51), pre-check in `open` (`clearance-service.ts` lines 62-64), retry on duplicate key (lines 87-110).
- The checklist is copied into the case at open (lines 66-85), with due dates set from the last working day plus `dueDaysAfterLastDay`. Later checklist edits do not change open cases.
- Nobody signs off their own clearance: `assertNotSelf` compares the actor's user to the employee (lines 28-38) and runs in `actOnItem` (line 157).
- `clear` on an auto-source item is refused while its facts are unsatisfied (lines 161-164).
- `flag`, `waive` and `reopen` need a note; `flag` may carry an amount (lines 165-173).
- Cancelled and closed cases are frozen: no item action (line 156), no auto-sync (line 225), no second cancel (line 263).
- Case status is derived: it becomes `cleared` when every blocking item is resolved (`clearance-summary.ts` `deriveCaseStatus`). Final settlement depends on this (header comment, lines 47-51).
- Auto-cleared items never un-clear (comment, line 221).
- Cancel needs a reason, sets `active: false` and frees the employee for a new case (lines 260-281).
- Audited: `clearance.opened`, `clearance.item-updated`, `clearance.item-auto-cleared`, `clearance.cancelled`, `clearance-checklist.created` / `.updated`.
- Every query filters by `organizationId`.

**Known gaps / mismatches:**
- **Reads write.** The case page calls `ClearanceService.syncAutomaticItems` on every view (`clearance/[id]/page.tsx` line 61), which can write items and audit entries during a GET-style render.
- **Travel orders never auto-clear.** `evaluateSource` returns `autoClears: false` for `travel_orders` (`clearance-sources.ts` line 46), so that item is always manual. The code documents this only through the flag.
- **Auto-clear is one-way, and nothing re-opens it.** If an asset is later marked as issued again, `AssetIssuanceService.update` does not touch the clearance (see assets file).
- **Direct audit read.** `clearance/[id]/page.tsx` line 70 queries `AuditLogModel` for anyone with `clearance.read`, bypassing the `audit-logs.read` gate used by Settings (see audit file).
- **Not transactional.** `open` creates the case and then writes audit entries and runs sync as separate operations (`clearance-service.ts` lines 87-121). ENGINEERING.md § 33 names employment state changes as needing atomicity; clearance is not listed, so record a decision.
- **Doc gap.** ADR-031 is the governing decision, but ARCHITECTURE.md has no Clearance section and its Known gaps do not mention clearance.
- Travel-date labels in auto-check details are formatted in UTC (`clearance-service.ts` `sourceFacts`, `timeZone: "UTC"`), not the app zone. Cosmetic, but inconsistent with ADR-045.
- `clearance.sign-off` also covers `reopen` (`items/[itemId]/route.ts` line 12), so reopening needs the same key as clearing.

**Last verified:** 6587050.
