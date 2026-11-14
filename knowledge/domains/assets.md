# Assets (issued company equipment)

**Purpose:** Records company equipment issued to an employee and when it came back; the "assets" clearance check reads it.
**Governing docs:** ADR-022; ARCHITECTURE.md § Travel Orders & Asset Issuance (ADR-022); ADR-031 (clearance consumer); ENGINEERING.md § 35 (audit), § 37 (domain services).
**Services:** `src/domains/assets/asset-issuance-service.ts`: `AssetIssuanceService`
- `create(employeeId, input, actor)`: checks the employee belongs to the org, creates the record, audits `asset-issuance.created`.
- `update(id, organizationId, patch, actor)`: full replace of the editable fields, audits `asset-issuance.updated` with before/after.
- `listForEmployee(employeeId, organizationId)`, `getById(id, organizationId)`: org-filtered reads.
- Private `assertDateOrder`: return date must not precede issue date.

**Models:**
- `AssetIssuance`: `src/server/db/models/asset-issuance.ts` (exports `ASSET_CONDITIONS`; `returnedDate` has no default, line 18; index `{ organizationId, employeeId }`, line 24).
- Reads `Employee` (`src/server/db/models/employee.ts`) for the existence check.

**Routes:**
- `src/app/api/employees/[id]/asset-issuances/route.ts`: GET (`asset-issuances.read`), POST (`asset-issuances.create`).
- `src/app/api/employees/[id]/asset-issuances/[recordId]/route.ts`: PATCH (`asset-issuances.update`). No DELETE handler.

**Pages:** No standalone page. Card on the person profile: `src/app/(app)/people/[id]/assets-tab.tsx`, with `asset-issuance-form-dialog.tsx` in the same folder.

**Tests:** `tests/domains/assets/asset-issuance-service.test.ts`. No route or component test.

**Rules a change must respect:**
- Return date is validated twice, keep both in step: the service (`asset-issuance-service.ts`, `assertDateOrder`) and the Zod schema (`src/shared/validation/asset-issuance.ts`, `superRefine`).
- An asset is "still issued" only when `returnedDate` is absent. `clearance-service.ts` `sourceFacts` queries `returnedDate: { $exists: false }`, so a stored `null` would not count as outstanding. Write the field as unset, not null, when an asset is not returned.
- `update()` replaces the whole record. A PATCH that omits `returnedDate` re-opens the asset (`asset-issuance-service.ts`, `update`, `record.returnedDate = patch.returnedDate`).
- `condition` is a fixed enum in the model, not a catalog (ARCHITECTURE.md § Travel Orders & Asset Issuance).
- No hard delete. Correct mistakes with `update()` (ARCHITECTURE.md, same section).
- Every write calls `AuditService.record` (`asset-issuance-service.ts`, lines 35-42 and 65-73). The audit happens after the write, outside a transaction.
- Scope every query by `organizationId` (`asset-issuance-service.ts`, `listForEmployee`, `getById`, `update`).

**Known gaps / mismatches:**
- Auto-cleared clearance items never un-clear (`clearance-service.ts`, `syncAutomaticItems` comment). Re-issuing an asset after the assets item cleared does not re-open that item, and `AssetIssuanceService.update` has no clearance hook.
- `update()` can silently re-open an asset that was marked returned (see rules above). The form must always send `returnedDate`.
- The audit entry is written after the record, with no transaction (ENGINEERING.md § 33 asks for transactions only where needed). No ADR records this choice.

**Last verified:** 6587050.
