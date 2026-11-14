# Deletion (recycle bin)

**Purpose:** Super-Administrator-only safe delete: a record and everything attached to it move into a 30-day recycle bin, where they can be restored or purged. Only record types listed in the registry can be deleted at all.
**Governing docs:** ADR-033 (Accepted, `docs/architecture/adr/ADR-033-safe-delete-recycle-bin.md`); ADR-041 (transactions for multi-document writes, cited in `deletion-service.ts`); ADR-030 addendum (cited in ADR-033: delete permissions are never granted to any role). ARCHITECTURE.md does not mention the recycle bin at all. ENGINEERING.md §33 (transactions only where needed).
**Services:**
- `src/domains/deletion/deletion-service.ts`: `DeletionService` with `preview(type, id, org)`, `remove(type, id, org, {confirm}, actor)`, `restore(batchId, org, actor)`, `purgeNow(batchId, org, actor)`, `purgeExpired(org?)`, `listBin(org)`. Also exports `RECYCLE_BIN_DAYS = 30`.
- `src/domains/deletion/deletion-registry.ts`: `DELETABLE_TYPES` (18 types), `isDeletableType`, and the `DeletionPlan` / `DeleteStep` / `PatchStep` types. Each type's planner lists the documents to move, the patches to records that stay, and the blockers.

**Models:**
- `src/server/db/models/deletion-batch.ts` (`DeletionBatch`): status `in_bin | restored | purged`, `label`, `summary`, `recordCount`, `patches`, `purgeAfter`; indexes `{organizationId, status, deletedAt}` and `{status, purgeAfter}`.
- `src/server/db/models/deleted-record.ts` (`DeletedRecord`): one moved document per row (`batchId`, `collectionName`, `doc`); index `{batchId}`.
- Every model a plan touches is listed in the registry (e.g. `EmployeeModel`, `PersonModel`, `PayrollRecordModel`, `FinalSettlementModel`, `TravelOrderModel`, `UserModel`, `RoleAssignmentModel`).

**Routes:**
- `src/app/api/deletions/route.ts`: `POST` remove (`requireAuthenticatedUser`; the service enforces Super Administrator).
- `src/app/api/deletions/preview/route.ts`: `GET` preview (checks `SuperAdminService.isSuperAdmin` in the route).
- `src/app/api/deletions/[batchId]/route.ts`: `POST` with `action: restore | purge` (service enforces Super Administrator).
- `src/app/api/cron/recycle-bin/route.ts`: `GET` daily purge across all organizations, `CRON_SECRET` checked via `checkCronAuthorization`. Scheduled in `vercel.json` (per `knowledge/overview.md`).

**Pages:**
- `src/app/(app)/settings/recycle-bin/page.tsx`: checks Super Administrator, calls `purgeExpired(organizationId)` on every open, then `listBin`. Actions in `bin-actions.tsx`.
- Delete buttons: `src/components/shared/delete-record-button.tsx`, used on `src/app/(app)/people/[id]/page.tsx`, `organization/{locations,positions,projects,units}/page.tsx`, `leave/types/page.tsx`, `cases/page.tsx`, `clearance/[id]/page.tsx`, `final-settlements/[id]/page.tsx`, `performance/page.tsx`, `performance/[id]/page.tsx`, `performance/evaluations/[id]/page.tsx`.

**Tests:**
- `tests/domains/deletion/deletion-service.test.ts` (7 tests)
- `tests/domains/deletion/cross-organization-deletion.test.ts` (5)
- `tests/domains/deletion/performance-deletion.test.ts` (4)
- `tests/app/delete-record-button.test.tsx`

**Registered types** (`DELETABLE_TYPES` keys): `employee`, `staff-account`, `clearance`, `final-settlement`, `performance-evaluation`, `performance-review`, `position`, `project`, `location`, `organization-unit`, `leave-type`, `shift-template`, `travel-order`, `case`, `event`, `applicant`, `asset-issuance`, `employee-document`.

**Rules a change must respect:**
- Only the Super Administrator can remove, restore or purge. The service checks it (`assertSuperAdmin` in `deletion-service.ts`). Preview is checked only in its route (`src/app/api/deletions/preview/route.ts`), so any new caller of `DeletionService.preview` must check too.
- A type not in `DELETABLE_TYPES` cannot be deleted. `isDeletableType` uses own-keys (`Object.hasOwn`) so `constructor` and similar are refused (`deletion-registry.ts`, end of file). New record types must be registered before they can be deleted (ADR-033 Consequences).
- Shared setup is refused while anything uses it. The `whileUnused` helper adds a blocker per referencing collection (`deletion-registry.ts`): positions, projects, locations, units, leave types, shifts.
- Employee deletion is blocked by approved or released payslips, a disbursed settlement, or a login account with roles in another organization (`planEmployee`, `crossOrganizationBlockers` in `deletion-registry.ts`). Draft payroll lines are deleted with the employee.
- The account that is the Super Administrator, or the actor's own staff account, cannot be deleted (`planStaffAccount`; `remove` checks `actor.userId === id`).
- Remove moves records inside one `withTransaction` (`deletion-service.ts` `remove`). Restore and purge first claim the batch with a conditional update on `status: "in_bin"` (`claimBatch`), so a restore and a purge cannot both win.
- Restore fails with `ConflictError` on a duplicate key (`isDuplicateKeyError` branch in `restore`).
- Blob files of documents and clock photos are removed only after purge commits, best effort (`purge`, `storedFilesOf`).
- Every remove, restore and purge writes an audit row: `record.deleted`, `record.restored`, `record.purged` (`deletion-service.ts`).

**Known gaps / mismatches:**
- `employee-document` is a registered deletable type (`deletion-registry.ts`), but ADR-025 says "no delete at all" for employee documents and ARCHITECTURE.md § Documents says "No delete of any kind". Code and docs disagree.
- ADR-033 Consequences say "Delete isn't transactional" and "no scheduler file exists yet". Both are stale: `remove` uses `withTransaction`, and `vercel.json` schedules the cron.
- ARCHITECTURE.md does not describe the recycle bin, the registry, or the cron purge. Only ADR-033 does.
- `LeaveTypeService.delete` (`src/domains/leave/leave-type-service.ts`) is a hard `deleteOne`, outside the bin. A leave type can therefore be removed two ways: permanently (only when unused) or into the bin.
- `DeletionService.preview` does no Super Administrator check itself (only its route does). See Rules.
- The recycle-bin page purges expired batches during render (`settings/recycle-bin/page.tsx`, line ~34). That is a write during a GET page render.
- ARCHITECTURE.md § Organization structure says services never delete. The registry does delete positions, projects, locations and units into the bin. Not a hard delete, but the wording differs.

**Last verified:** 6587050
