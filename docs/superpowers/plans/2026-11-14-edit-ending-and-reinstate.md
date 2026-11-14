# Edit ending and Reinstate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let HR correct how an employment ended (for example Terminated to Resigned) and reinstate an employee whose ending was wrong.

**Architecture:** Two new `EmploymentService` actions keyed by employee id, a shared guard extracted from the existing `terminate`, an optional `endingHistory` list on `Employment`, two thin routes beside the existing employment routes, and two dialogs on the profile of an ended employee. What counts as an ended status is catalog data (`EmploymentStatus.isActiveHeadcount`), never a code list.

**Tech Stack:** Next.js App Router, TypeScript, Mongoose, Zod, vitest + Testing Library, mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-11-14-edit-ending-and-reinstate-design.md` (approved 2026-11-14). Read it with this plan.

## Global Constraints

- Both actions use the existing permission `employees.update`. No new permission key.
- Operate only on the employee's **latest** employment (sort `effectiveFrom` descending). If it is open, nothing is ended: refuse.
- Reinstate sets status `"active"` and clears `effectiveTo` and `terminationReason`; service continues from the original hire date.
- Reinstate is refused when: not ended; a final settlement with status `disbursed` was created on or after this employment's `effectiveFrom`; an active clearance case exists (`ClearanceCaseModel`, `active: true`).
- Edit ending: last-day change is refused when a final settlement not `cancelled` was created on or after this employment's `effectiveFrom`. Reason and note may always change.
- End-date rules are the same as End employment: not in the future (organization's Manila day via `localDateKey`), not before the hire date, status must not be explicitly flagged `isActiveHeadcount: true`.
- Dates are calendar-day keys in the app zone (ADR-045). Every query is scoped by `organizationId`.
- Audit actions: `employment.ending_corrected`, `employment.reinstated`, each with `before` and `after`. History entries are appended, never edited or removed.
- Keep every existing test green. `terminate`'s behavior and messages do not change.

## Review Focus

- A rehired employee with an old **disbursed** settlement from an earlier stint can still be reinstated for the later stint (settlement scoped by `createdAt >= employment.effectiveFrom`). Pinned in Task 2.
- Another organization's employee id reads as not found, for both actions. Pinned in Tasks 1 and 2.
- Two HR users reinstate at once: the second gets "hasn't ended", never a duplicate history entry. Pinned in Task 2.
- A corrected last day equal to today, or to the hire date, is allowed (boundaries). Pinned in Task 1.
- Correcting to a reason flagged active headcount (for example On Leave) is refused. Pinned in Task 1.
- Reinstating leaves attendance records and payroll records untouched. Pinned in Task 2.

---

## File Structure

- Modify `src/server/db/models/employment.ts`: add optional `endingHistory`.
- Modify `src/domains/workforce/employment-service.ts`: shared guard, `terminate` writes history, `correctEnding`, `reinstate`, `getEndingState`.
- Modify `src/shared/validation/workforce.ts`: `correctEndingSchema`, `reinstateEmploymentSchema`.
- Create `src/app/api/employees/[id]/employment/ending/route.ts` and `.../reinstate/route.ts`.
- Create `src/app/(app)/people/[id]/edit-ending-dialog.tsx` and `reinstate-dialog.tsx`.
- Modify `src/app/(app)/people/[id]/page.tsx` and `job-tab.tsx`: buttons, history.
- Create `docs/architecture/adr/ADR-054-correcting-and-reversing-an-ending.md`; update `knowledge/domains/workforce.md`.
- Tests: `tests/domains/workforce/employment-ending-service.test.ts`, `tests/app/api/employment-ending-routes.test.ts`, `tests/app/edit-ending-dialog.test.tsx`, `tests/app/reinstate-dialog.test.tsx`.

---

### Task 1: Ending history and Edit ending (service)

**Files:**
- Modify: `src/server/db/models/employment.ts`, `src/domains/workforce/employment-service.ts`
- Test: `tests/domains/workforce/employment-ending-service.test.ts` (create)

**Interfaces:**
- Consumes: existing `EmploymentService.terminate(id, orgId, patch, actor)`, `EmploymentStatusService.getByCode/assertValidCode`, `localDateKey`.
- Produces:
  - `endingHistory` on `Employment`: array of `{ action: "ended" | "ending_corrected" | "reinstated"; status: string; effectiveTo?: Date; reason?: string; changedBy?: ObjectId; changedAt: Date }`, default `[]`.
  - `EmploymentService.correctEnding(employeeId: string, organizationId: string, patch: { status?: string; effectiveTo?: Date; terminationReason?: string }, actor: { userId?: string }): Promise<EmploymentDoc>`.
  - Private `assertEndingFields(organizationId: string, employment: { effectiveFrom: Date }, patch: { status?: string; effectiveTo?: Date }): Promise<void>` holding the three guards `terminate` has today (active-flag status refused, future date refused, before-hire refused); `terminate` calls it with the same messages.

- [ ] **Step 1: Write the failing tests** in `employment-ending-service.test.ts`. Helper `endedEmployee(suffix, { status: "terminated" | "resigned", effectiveFrom?, effectiveTo? })` creating org, person, employee, a status catalog (`terminated`, `resigned` with `isActiveHeadcount: false`; `on_leave` with `true`) and an employment ended via `EmploymentService.terminate`. Tests, with these names and assertions:
  - `terminate now records an "ended" entry in endingHistory`: one entry, `action "ended"`, `status "terminated"`.
  - `corrects Terminated to Resigned in one step, never active`: after `correctEnding(employeeId, org, { status: "resigned", terminationReason: "Resignation letter 3 Nov" })` employment `status === "resigned"`, `effectiveTo` unchanged, reason updated, history has a second entry `ending_corrected`; audit `employment.ending_corrected` has `before.status "terminated"` and `after.status "resigned"`.
  - `allows a last day equal to today and equal to the hire date` (two calls, both resolve).
  - `refuses a future last day, one before the hire date, and a reason flagged active headcount` (`BusinessRuleError` each, record unchanged).
  - `refuses when nothing changed` (message matches `/Nothing changed/`).
  - `refuses an employment that has not ended` (open employment; message `/hasn.t ended/`).
  - `reads another organization's employee as not found` (`NotFoundError`).
  - `refuses a last-day change once a final settlement that is not cancelled exists, but still lets the reason change`: create a `FinalSettlementModel` row (status `draft`, `createdAt` after hire) then assert last-day change rejects with `/final settlement/i`, reason change resolves; with that settlement `cancelled`, the last-day change resolves.
- [ ] **Step 2: Run** `npx vitest run tests/domains/workforce/employment-ending-service.test.ts`. Expected: FAIL (`correctEnding is not a function`, no history entry).
- [ ] **Step 3: Add `endingHistory`** to the Employment schema (subdocument array, `_id: false`, same style as `termsHistory`).
- [ ] **Step 4: Extract `assertEndingFields`** from `terminate`, call it there, and make `terminate` push an `"ended"` history entry in the same save. Run `npx vitest run tests/domains/workforce/employment-service.test.ts`. Expected: PASS (nothing existing changes).
- [ ] **Step 5: Implement `correctEnding`.** Load the latest employment for the employee (scoped by organization); not found: `NotFoundError`; open: `BusinessRuleError("This employee's employment hasn't ended, so there is nothing to correct.")`. Apply `assertEndingFields` for any field present. Compare with the stored values and refuse `"Nothing changed: pick a different reason, last day or note."`. If the last day changes and `FinalSettlementModel.exists({ organizationId, employeeId, status: { $ne: "cancelled" }, createdAt: { $gte: employment.effectiveFrom } })`, refuse with `"The last day can't change: a final settlement was already prepared from it. Cancel the settlement first."`. Update with `findOneAndUpdate`, push the history entry, audit `employment.ending_corrected`.
- [ ] **Step 6: Run** the Task 1 tests and `tests/domains/workforce`. Expected: PASS.
- [ ] **Step 7: Stage** `git add` the changed files. (The owner commits later; do not commit.)

---

### Task 2: Reinstate and ending state (service)

**Files:**
- Modify: `src/domains/workforce/employment-service.ts`
- Test: `tests/domains/workforce/employment-ending-service.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1's history shape and latest-employment lookup.
- Produces:
  - `EmploymentService.reinstate(employeeId: string, organizationId: string, input: { reason: string }, actor: { userId?: string }): Promise<EmploymentDoc>`.
  - `EmploymentService.getEndingState(employeeId: string, organizationId: string): Promise<{ ended: boolean; reinstateBlockedReason: string | null; lastDayLockedReason: string | null }>`. The reason strings are the same messages the actions throw, so the UI shows what the server would say.

- [ ] **Step 1: Write the failing tests** (same file):
  - `reinstates the same employment: active, no end date, same hire date, history and audit`: status `"active"`, `effectiveTo` undefined, `terminationReason` undefined, `effectiveFrom` unchanged, history last entry `reinstated` with the reason, audit `employment.reinstated` with before `terminated` and after `active`; `EmploymentService.getCurrent(employeeId)` now returns it.
  - `requires a reason` (`""` and whitespace: `BusinessRuleError`, `/why/i`).
  - `refuses when not ended`, and `refuses a second reinstate (race)`: second call rejects `/hasn.t ended/` and history has exactly one `reinstated` entry.
  - `refuses when final pay was disbursed` (settlement `status "disbursed"`, `/paid out/`).
  - `ignores a disbursed settlement from an earlier stint`: settlement `createdAt` before this employment's `effectiveFrom` does not block.
  - `refuses while a clearance case is open, and allows it once the case is cancelled` (`ClearanceCaseModel` `active: true` then `false`; message `/clearance/i`).
  - `reads another organization's employee as not found` (`NotFoundError`).
  - `leaves attendance and payroll records untouched`: create an `AttendanceRecord` and a `PayrollRecord` for the employee, reinstate, assert both unchanged by `updatedAt` and fields.
  - `getEndingState`: open employment gives `ended false`; ended gives `ended true`, `reinstateBlockedReason null`; with a disbursed settlement gives that message; with a draft settlement gives `lastDayLockedReason` set and `reinstateBlockedReason null`.
- [ ] **Step 2: Run** the file. Expected: new tests FAIL (`reinstate is not a function`).
- [ ] **Step 3: Implement `reinstate`.** Same lookup and not-ended refusal as `correctEnding` (message ends "nothing to reinstate."). Refuse a blank reason with `"Enter why the employment is being reinstated."`. Guards, in this order, with these messages: disbursed settlement `"Final pay was already paid out, so this employment can't be reinstated."`; open clearance `"A clearance is still open for this employee. Cancel it first, then reinstate."`. Apply with one conditional `findOneAndUpdate` filtered on `{ _id, organizationId, effectiveTo: { $type: "date" } }` (`$set` status `"active"`, `$unset` `effectiveTo` and `terminationReason`, `$push` history); a null result is the race and throws the not-ended `BusinessRuleError`. Audit `employment.reinstated`.
- [ ] **Step 4: Implement `getEndingState`** by sharing the guard queries with Task 1 and `reinstate` (one private function each for "disbursed settlement exists", "non-cancelled settlement exists", "active clearance exists"), so the UI and the actions cannot disagree.
- [ ] **Step 5: Run** the file and `tests/domains/workforce`. Expected: PASS.
- [ ] **Step 6: Stage** the changed files.

---

### Task 3: Validation and routes

**Files:**
- Modify: `src/shared/validation/workforce.ts`
- Create: `src/app/api/employees/[id]/employment/ending/route.ts`, `src/app/api/employees/[id]/employment/reinstate/route.ts`
- Test: `tests/app/api/employment-ending-routes.test.ts` (create; follow the pattern in `tests/app/api/employment-and-evaluation-routes.test.ts`)

**Interfaces:**
- Consumes: `EmploymentService.correctEnding`, `reinstate` (Tasks 1 and 2).
- Produces:
  - `correctEndingSchema` = `{ organizationId: objectId(); status?: string (trim, max 200); effectiveTo?: z.coerce.date(); terminationReason?: string (trim, max 2000) }`.
  - `reinstateEmploymentSchema` = `{ organizationId: objectId(); reason: string (trim, min 1, max 2000) }`.
  - `PATCH /api/employees/[id]/employment/ending` returns `{ employment: { status, effectiveTo } }`; `POST /api/employees/[id]/employment/reinstate` returns `{ employment: { status } }` (200).

- [ ] **Step 1: Write the failing tests:** each route returns 401 with no session, 403 without `employees.update`, 400 on a malformed body (and on a malformed id), 404 for another organization's employee, 422 for a business-rule refusal (message passed through), and 200 with the documented body on success. Mock the session the way the sibling route tests do.
- [ ] **Step 2: Run** the file. Expected: FAIL (routes missing).
- [ ] **Step 3: Add the two schemas**, then the two routes. Pattern: parse id with `objectId()`, parse body, `requirePermission("employees.update", organizationId)`, call the service, `toErrorResponse` in `catch`, exactly like `employment/terms/route.ts`.
- [ ] **Step 4: Run** the file and `npx vitest run tests/security tests/shared`. Expected: PASS (the route-guard test finds the routes and the permission exists).
- [ ] **Step 5: Stage** the changed files.

---

### Task 4: The two dialogs

**Files:**
- Create: `src/app/(app)/people/[id]/edit-ending-dialog.tsx`, `src/app/(app)/people/[id]/reinstate-dialog.tsx`
- Test: `tests/app/edit-ending-dialog.test.tsx`, `tests/app/reinstate-dialog.test.tsx` (create)

**Interfaces:**
- Consumes: `EndReasonChoice` from `end-employment-dialog.tsx`; routes from Task 3.
- Produces:
  - `EditEndingDialog({ organizationId, employeeId, employeeName, reasons: EndReasonChoice[], todayKey, hiredKey, current: { status: string; effectiveToKey: string; note: string }, lastDayLockedReason: string | null })`. Button test id `edit-ending-button`, reason select `edit-ending-reason`, submit `edit-ending-submit`. Starts with the current values. A locked last day renders the date field disabled with the reason as its description. Sends `PATCH /api/employees/{employeeId}/employment/ending` with `{ organizationId, status, effectiveTo, terminationReason }`, omitting the date when locked. Disables Save until something differs. Same client checks as `EndEmploymentDialog` (no future date, not before hire, note required when the reason requires one).
  - `ReinstateDialog({ organizationId, employeeId, employeeName, blockedReason: string | null })`. Button `reinstate-button`, reason textarea label "Reason", submit `reinstate-submit`. When `blockedReason` is set the button still opens the dialog but shows the reason and disables submit. Sends `POST /api/employees/{employeeId}/employment/reinstate` with `{ organizationId, reason }`. Success: toast `"{employeeName} is back on the active roster"` and `router.refresh()`.

- [ ] **Step 1: Write the failing tests** (jsdom, mock `next/navigation` and `sonner` exactly as `end-employment-dialog.test.tsx` does): edit dialog starts on the current reason, sends the changed reason, keeps Save disabled until a change, disables and explains a locked last day (and omits it from the body), refuses a future date, shows the server's refusal and stays open. Reinstate dialog requires a reason before sending, sends it, shows the blocked reason with submit disabled, shows the server's refusal and stays open.
- [ ] **Step 2: Run** both files. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement both dialogs** following `end-employment-dialog.tsx` (same `useFieldErrors` use, `OptionSelect`, `Dialog` pieces, pending button). Share nothing between them unless it removes real duplication.
- [ ] **Step 4: Run** both files and `npx vitest run tests/app/end-employment-dialog.test.tsx`. Expected: PASS.
- [ ] **Step 5: Stage** the changed files.

---

### Task 5: Profile wiring, history, ADR and knowledge

**Files:**
- Modify: `src/app/(app)/people/[id]/page.tsx`, `src/app/(app)/people/[id]/job-tab.tsx`, `knowledge/domains/workforce.md`
- Create: `docs/architecture/adr/ADR-054-correcting-and-reversing-an-ending.md`
- Test: `tests/app/job-tab-ending-history.test.tsx` (create)

**Interfaces:**
- Consumes: `EmploymentService.getEndingState`, both dialogs, `endReasonChoices`, the employment's `endingHistory`.
- Produces: `EndingHistoryView = { action: "ended" | "ending_corrected" | "reinstated"; statusName: string; lastDayKey: string | null; reason: string | null; at: string }`, and a new optional prop `endingHistory?: EndingHistoryView[]` on `JobTab`, rendered as an "Ending history" list, newest first, with action labels "Ended", "Ending corrected", "Reinstated"; nothing is rendered when empty.

- [ ] **Step 1: Write the failing test** for `JobTab`: renders the three action labels with status name, last day and reason, newest first; renders nothing when `endingHistory` is empty or absent.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement the `JobTab` section**, then wire `page.tsx`: load all statuses once (`EmploymentStatusService.listCurrent`), derive `endReasons` from it (replacing the `canUpdate`-only load) and a status name map; for an ended employment (`detail.currentEmployment` exists, `!isCurrentlyActive`) and `canUpdate`, load `getEndingState` and render `EditEndingDialog` and `ReinstateDialog` next to the status badge; build `endingHistory` from `detail.currentEmployment.endingHistory`.
- [ ] **Step 4: Write ADR-054** (decision: edit ending and reinstate, rehire stays a new employment, guards, `endingHistory`, payroll-gap risk) and update `knowledge/domains/workforce.md` (service methods, routes, rules, the gap risk).
- [ ] **Step 5: Verify:** `npm run typecheck`; `npx eslint` on the changed paths; `(npm run test:ui; npm run test:domains; npm run test:core)` and report every failure by name. Expected: the new tests pass and no previously green test turns red.
- [ ] **Step 6: Stage** the changed files; do not commit.

---

## Self-review

- **Spec coverage:** edit ending rules (Task 1), reinstate rules and guards (Task 2), history (Tasks 1, 2, 5), screens and routes (Tasks 3, 4, 5), audit (Tasks 1, 2), ADR and knowledge (Task 5), payroll-gap risk documented (Task 5). Non-goals (rehire screen, backfill, bulk) have no task, as intended.
- **Types:** `correctEnding`, `reinstate`, `getEndingState`, `EndingHistoryView` and the dialog props are named identically wherever they appear.
- **Proportion:** the plan lists tests by name and assertion and fixes only signatures, messages and guard order; bodies are left to the implementer.
