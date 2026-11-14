# Final settlement (separation pay-out)

**Purpose:** The separation pay-out for one clearance case. It is computed from live payroll, leave and clearance records while a draft, then moves through submit, review, approve and disburse. Disbursing closes the clearance.
**Governing docs:** ADR-032 (**Proposed, "Design only; not yet implemented"**, dated 2026-09-30: `docs/architecture/adr/ADR-032-final-settlement.md`). The code implements part of it (see gaps). ADR-031 (Workforce Clearance, referenced by ADR-032). ADR-041 (the disburse and clearance-close write is one transaction). ADR-033 (settlements are registered for the recycle bin). ENGINEERING.md §33 (transactions).
**Services:**
- `src/domains/final-settlement/final-settlement-service.ts`: `FinalSettlementService` with `prepare(clearanceId, org, actor)`, `addManualLine`, `removeManualLine`, `act(id, org, input, actor)` where `input.action` is `submit | review | approve | return | disburse | cancel`, `getByClearance`, `getById`, `listForOrganization`.
- `src/domains/final-settlement/settlement-calculator.ts`: pure `computeSettlement(inputs)` and `countWorkdays`. Types `SettlementLine`, `ManualLine`, `SettlementInputs`.
- Inputs are gathered from `CompensationService` and `PayrollPolicyService` (`src/domains/payroll/`), `EmployeeAssignmentService` (`src/domains/workforce/`), `LeaveBalanceService.summarizeForYear` (`src/domains/leave/`), and `PaymentMethodService` (`src/domains/catalog/`).

**Models:**
- `src/server/db/models/final-settlement.ts` (`FinalSettlement`): `clearanceCaseId`, `employeeId`, `status` (`FINAL_SETTLEMENT_STATUSES`), `version`, `lines`, `manualLines`, `totals {earnings, deductions, net}`, `inputs`, `history[]`, `payment {methodCode, reference, paidAt}`. Unique index `{organizationId, clearanceCaseId}`.
- Read only: `clearance-case.ts` (status, flagged items with amounts), `payroll-run.ts`, `payroll-record.ts`, `payroll-adjustment.ts`, `leave-type.ts` (`convertibleAtSeparation`).

**Routes:**
- `src/app/api/final-settlements/route.ts`: `POST` prepare (`final-settlements.prepare`).
- `src/app/api/final-settlements/[id]/route.ts`: `PATCH` act. The permission is mapped per action: `submit` and `cancel` use `prepare`, `review` and `return` use `review`, `approve` uses `approve`, `disburse` uses `disburse`.
- `src/app/api/final-settlements/[id]/lines/route.ts`: `POST` manual line (`final-settlements.prepare`).
- `src/app/api/final-settlements/[id]/lines/[lineId]/route.ts`: `DELETE` manual line (`final-settlements.prepare`).
- Reads are server-side in the pages. There is no GET route.

**Pages:**
- `src/app/(app)/final-settlements/page.tsx`, `loading.tsx`, `settlement-labels.ts`, `prepare-settlement-button.tsx`.
- `src/app/(app)/final-settlements/[id]/page.tsx`, `settlement-actions.tsx`, `manual-line-form.tsx`, `remove-line-button.tsx`.

**Tests:**
- `tests/domains/final-settlement/final-settlement-service.test.ts` (7)
- `tests/domains/final-settlement/settlement-calculator.test.ts` (5)
- `tests/app/settlement-actions.test.tsx`

**Rules a change must respect:**
- Only a `draft` can be prepared again, have lines added or removed, or be edited. `saveWhileDraft` writes only if the stored status is still `draft`. A concurrent change becomes `ConflictError` (`final-settlement-service.ts`).
- Submit needs the clearance to be `cleared`. A clearance with blocking items cannot be submitted (`act`, case `submit`).
- Submit, review, approve and disburse all need the settlement's `accountability` lines to match the clearance's current flagged items with amounts: same items, same amounts (`accountabilityDrift` in `settlement-accountabilities.ts`, checked at the top of `act`). A flag added, re-amounted, cleared or waived after the settlement was computed makes these a `BusinessRuleError` until it is recomputed. The settlement page (`final-settlements/[id]/page.tsx`) shows the same differences in a banner.
- Maker-checker on approve: anyone whose id appears on a `prepared` or `recomputed` history entry cannot approve (`act`, case `approve`).
- Every transition is a conditional `updateOne` on the status read at the start (`commit`). Two actors racing on the same settlement cannot both win.
- Disburse needs a payment method code (checked by `PaymentMethodService.assertValidCode`) and a reference. It sets `payment` and closes the clearance (`status: closed`, `active: false`) in one `withTransaction` (ADR-041).
- Return and cancel need a note. Cancel is allowed only from `draft` or `submitted`.
- Manual lines need a reason and a positive amount (`addManualLine`). They are the only way to add a line outside the calculator's rules.
- Calculator rules (`settlement-calculator.ts`): salary balance is the workdays from the day after the last paid-through date to the last working day, times the daily rate. The daily rate is `rate * 12 / workDaysPerYear` for monthly pay. Leave encashment covers convertible types with a positive balance. The 13th-month share is `(basic earned this year + salary balance) / divisor - already paid`. Flagged clearance items become deductions.
- The inputs used are stored in `inputs`, and every act appends to `history`.
- If the employee has no pay terms on the last working day, or no payroll policy applies, prepare stops with `BusinessRuleError`.

**Known gaps / mismatches (ADR-032 against the code):**
- ADR-032 is Proposed and says "not yet implemented", but the code implements a subset. The ADR status is stale or the implementation is partial. Either way the two disagree.
- "Disbursed: release creates the `final` payroll run" (ADR-032 Decision). `disburse` only sets status and payment (`final-settlement-service.ts`). `PayrollRunModel` is read, never written.
- "Each approved version stores a hash of its lines and inputs" (ADR-032, Tamper evidence). The model has no hash field and no code computes one.
- Variance checks (ADR-032: net pay negative, leave cap, 13th month paid, tax true-up, recent rate change, missing government IDs). None are in the service or the calculator.
- Manual lines need "a reason and an attachment" (ADR-032). Only `reason` is required.
- "The preparer can't review or approve" (ADR-032, Segregation of duties). Only approve checks the preparer. `act` case `review` has no check.
- "Locked inputs … sources changed since approval" warning (ADR-032). Not implemented. The stored `inputs` do not change after approval, but nothing warns when source records change.
- Two final-pay deadline sources are not reconciled. The settlement reads `PayrollPolicy.finalPayDeadlineDays` (default 30) into `inputs`. The dashboard's compliance risk reads `Organization.compliance.finalPayDays` (default 30) from `src/app/(app)/dashboard/page.tsx` line ~299 and `src/domains/dashboard/compliance-risks.ts`. A change to one does not change the other.
- The calculator's own comment says tax true-up and statutory contributions come later. Neither is in the code.

**Last verified:** 6587050
