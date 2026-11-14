# Leave

**Purpose:** Leave types (a catalog), leave policies (organization with project override), per-employee yearly balances, and leave requests with a pending, approved, rejected or cancelled workflow. Balances are derived, not stored as a running total.
**Governing docs:** ADR-012 (Accepted, `docs/architecture/adr/ADR-012-leave-approval-workflow.md`; `leave.approve` is its own permission); ARCHITECTURE.md § Leave (Phase 6, ADR-012); ARCHITECTURE.md § Security hardening (ADR-040: "leave and payroll state changes are conditional updates"); ARCHITECTURE.md § Known gaps (project scope covers attendance, projects and payroll runs only, ADR-043); ENGINEERING.md §26 (policy resolution, cited in `leave-policy-service.ts`) and §57 (Phase 6 order).
**Services** (all in `src/domains/leave/`):
- `leave-request-service.ts`: `LeaveRequestService` with `create(input, actor)`, `decide(id, org, {decision, rejectionReason?}, actor)`, `cancel(id, org, actor)`, `listForEmployee`, `listForOrganization`, `countPending`, `listCoveringDate`, `summary(org, now)`, `page(org, query)`. Exports `LeaveRequestSummary` and `LeaveRequestPageQuery`.
- `leave-balance-service.ts`: `LeaveBalanceService` with `create`, `adjust`, `listCurrent`, `listForEmployee`, `summarizeForYear(org, year)`, `grantMissing(input, actor)`, `getAvailable({org, employeeId, leaveTypeId, year, countPending?})`.
- `leave-policy-service.ts`: `LeavePolicyService` with `create`, `updateStatus`, `listCurrent`, `resolve({org, projectId?, leaveTypeId, effectiveDate})`. `resolve` delegates to `resolveOrgProjectPolicy` in `src/server/policies/resolve-org-project-policy.ts`.
- `leave-type-service.ts`: `LeaveTypeService` with `create`, `updateStatus`, `setConvertible`, `update`, `delete`, `listCurrent`.

**Models:**
- `src/server/db/models/leave-request.ts`: `employeeId`, `leaveTypeId`, `startDate`, `endDate`, `totalDays`, `status` (`pending | approved | rejected | cancelled`), `approvedBy`, `approvedAt`, `rejectionReason`. Non-unique indexes on `{organizationId, employeeId, startDate}`, `{organizationId, status}`, `{organizationId, startDate: -1}`.
- `src/server/db/models/leave-balance.ts`: `entitledDays`, `adjustmentDays`, `hasNoFixedAmount`, `year`. Unique index `{organizationId, employeeId, leaveTypeId, year}`.
- `src/server/db/models/leave-policy.ts`: `leaveTypeId`, `projectId?`, `name`, `annualEntitlementDays`, `status`, `effectiveFrom`, `effectiveTo`. Index `{organizationId, projectId, leaveTypeId}`.
- `src/server/db/models/leave-type.ts`: `name`, `code`, `requiresApproval`, `convertibleAtSeparation`, `status`. Unique index `{organizationId, code}`.

**Routes** (`src/app/api/`):
- `leave-types/route.ts`: `GET` `leave-types.read`, `POST` `leave-types.create`.
- `leave-types/[id]/route.ts`: `PATCH` `leave-types.update` (convertible toggle, rename, or status), `DELETE` `leave-types.delete`.
- `leave-policies/route.ts`: `GET` `leave-policies.read`, `POST` `leave-policies.create`. `leave-policies/[id]/route.ts`: `PATCH` `leave-policies.update`.
- `leave-balances/route.ts`: `GET` `leave-balances.read`, `POST` `leave-balances.create`. `leave-balances/[id]/route.ts`: `PATCH` (adjust) `leave-balances.update`. `leave-balances/bulk/route.ts`: `POST` (grantMissing) `leave-balances.create`.
- `leave-requests/route.ts`: `GET` `leave.read`, `POST` `leave.create`. `leave-requests/[id]/route.ts`: `PATCH` with `leave.update` for cancel and `leave.approve` for decide.

**Pages** (`src/app/(app)/`):
- `leave/page.tsx`, `decide-actions.tsx`, `new-request-dialog.tsx`, `loading.tsx`.
- `leave/balances/page.tsx`, `employee-balance-sheet.tsx`, `create-leave-balance-dialog.tsx`, `usage-bar.tsx`.
- `leave/policies/page.tsx`, `create-leave-policy-dialog.tsx`.
- `leave/types/page.tsx`, `leave-type-form-dialog.tsx`, `convertible-toggle.tsx`, `delete-leave-type-button.tsx`.
- `people/[id]/leave-tab.tsx`, `grant-leave-balance-dialog.tsx` (ARCHITECTURE.md § Leave: the same balance dialogs are reused on the person page).

**Tests:**
- `tests/domains/leave/leave-request-service.test.ts` (11), `leave-balance-service.test.ts` (8), `leave-policy-service.test.ts` (5), `leave-type-service.test.ts` (9), `cross-organization-integrity.test.ts` (3).
- No `tests/app` file targets a leave page directly.

**Rules a change must respect:**
- Available days = `entitledDays + adjustmentDays - approved totalDays` in the year (`getAvailable`). A request counts toward the year it starts in. Pending requests count only when `countPending` is passed, which `create` does, so two requests cannot claim the same days.
- `hasNoFixedAmount` balances report `Infinity` available (`getAvailable`), and `null` in summaries (`summarizeForYear`).
- `create` refuses a request that overlaps any pending or approved request of the same employee, across leave types (`LeaveRequestModel.exists` in `create`), and refuses days above the available balance.
- `decide` re-checks the balance at approval (approved only). It refuses a decision on your own leave: the actor's linked `employeeId` is compared with the request's (`decide`).
- A decision is a conditional `findOneAndUpdate` on `status: "pending"`, so two approvers cannot both win (`decide`).
- Only a `pending` request can be decided or cancelled.
- `totalDays` is the inclusive count of calendar days. Weekends and holidays are not excluded (comment in `leave-request-service.ts`).
- `leave.approve` and `leave.update` are separate permissions (`leave-requests/[id]/route.ts`). Keep them separate when changing roles.
- A leave type cannot be deleted while a request, balance or policy references it. The message tells HR to deactivate instead (`LeaveTypeService.delete`).
- `convertibleAtSeparation` on a leave type is read by final settlement to pay unused days out (`src/domains/final-settlement/final-settlement-service.ts`, `gatherInputs`).
- `grantMissing` skips employees who already have a balance for that type and year, and audits the batch once (`leave-balance.granted-in-bulk`).
- Policy lookup goes through `resolveOrgProjectPolicy` with `leaveTypeId` as the extra filter (`leave-policy-service.ts`).

**Known gaps / mismatches:**
- ARCHITECTURE.md § Security hardening says leave state changes are conditional updates. `decide` is, but `cancel` is not: it loads the request, checks `status`, then calls `save()` with no status condition (`leave-request-service.ts`, `cancel`). A cancel that races a decide can overwrite the decision.
- The overlap check and the balance check in `create` are read-then-insert. Nothing in the schema prevents two concurrent requests from both passing (the indexes are not unique), and `create` does not use a transaction.
- `approvedAt` is set on rejections too. `decide` writes `approvedAt: decidedAt` whether the decision is approved or rejected (`leave-request-service.ts`, `decide`). The field name is misleading.
- Leave days count calendar days, not workdays, and ignore holidays. ARCHITECTURE.md § Known gaps says this ("leave counts calendar days"). This is a known simplification, not a bug.
- Leave policies accept a `projectId`, but ARCHITECTURE.md § Known gaps (ADR-043) says project scope does not cover leave. Leave routes use organization-wide checks, so a project-scoped holder is refused rather than granted. The `projectId` on a policy only affects which policy `resolve` picks.
- `LeaveTypeService.delete` is a hard delete. The recycle bin also registers `leave-type` (`src/domains/deletion/deletion-registry.ts`), so the same record has two delete paths.
- `LeaveRequestService.create` has no `policy` check. Balance is the only gate, so a policy is not required for a request to be filed.

**Last verified:** 6587050
