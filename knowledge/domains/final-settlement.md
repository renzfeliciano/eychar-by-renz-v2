# Final settlement (separation pay-out)

**Purpose:** The separation pay-out for one clearance case. It is computed from live payroll, leave and clearance records while a draft, then moves through submit, review, approve and disburse. Disbursing closes the clearance.
**Governing docs:** ADR-032 (final settlement; implemented 2026-11-14 by payroll plan Phase 5, see its implementation section), ADR-061 (final pay run, fingerprint and checks), ADR-062 (separation type → employment status). ADR-031 (Workforce Clearance, referenced by ADR-032). ADR-041 (the disburse and clearance-close write is one transaction). ADR-033 (settlements are registered for the recycle bin). ENGINEERING.md §33 (transactions).
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
- Resolved 2026-11-14 (payroll plan Phase 5, ADR-061): disburse creates the `final` run in the same transaction; approve stores a SHA-256 fingerprint and disburse checks it; the variance checks are policy data (`final-pay-checks.ts`) with acknowledgement of warnings at approve; the preparer can't review or approve; manual lines need a reason and a document; contributions and the tax true-up use the engine (`settlement-statutory.ts`); the dashboard reads the policy's deadline; an inputs-changed check warns when source records changed after approval.
- Open: the legal checks (DOLE 30-day rule, de minimis leave limit, partial-month contribution base) are known gaps B25; no settings screen for the separation-type mapping and the policy form doesn't show check severities (B26).

**Last verified:** 2026-11-15 (payroll plan Phase 8)
