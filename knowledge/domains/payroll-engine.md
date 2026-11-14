# Payroll engine: pay calculation, rule versions, tax, money, effective dating

**Purpose:** The pure calculation of one employee's payslip from resolved inputs, the rule data it reads (rule versions with tax tables and contribution tables), and the rounding and date rules every payroll number follows. Run lifecycle and services are in `payroll.md`.
**Governing docs:** ENGINEERING.md § 28 (Payroll: configurable rules, reproducibility, no hardcoded formulas), § 27 (Effective dating), § 26 (Policy resolution); ADR-029 (Decision: calculation engine, attendance, rule versions, compensation); ADR-014 (Decisions 1 and 2; Decision 1 on computed vs. HR-supplied lines); ADR-011 (resolver origin); ARCHITECTURE.md § Payroll (the engine paragraph, ~line 198).
**Services (pure functions unless noted):**
- `src/domains/payroll/engine/compute-pay.ts`: `computeEmployeePay(input)` returns `PayResult` (earnings, contributions, deductions, gross, taxable income, tax, net, warnings).
- `src/domains/payroll/engine/contributions.ts`: `computeMonthlyContributionExact(rule, monthlyBase)` (unrounded, used before per-cutoff split), `computeMonthlyContribution` (rounded).
- `src/domains/payroll/payroll-tax.ts`: `computeProgressiveBracketTax(taxableIncome, brackets)`.
- `src/domains/payroll/engine/pay-frequency.ts`: `periodsPerMonth`, `perPeriodFromMonthly`, `isLastCutoffOfMonth`, `PAY_FREQUENCIES`.
- `src/domains/payroll/engine/pay-periods.ts`: `periodEndingOnOrBefore`, `periodContaining`, `nextPeriod` (schedule cutoffs).
- `src/domains/payroll/engine/premiums.ts`: `PAY_PREMIUM_DEFAULTS`, `payPremiumsOf(policy)`, `formatMultiplierPercent`.
- `src/domains/payroll/engine/money.ts`: `sumMoney`; re-exports `roundMoney` from `src/lib/money.ts`.
- `src/lib/money.ts`: `roundMoney`, `formatMoney` (₱ display), `formatAmount` (no symbol). Shared by payroll, clearance and final settlement.
- `src/server/policies/resolve-org-project-policy.ts`: `resolveOrgProjectPolicy(model, params)`, the shared Organization→Project resolver used by policies and rule versions.
- `src/domains/payroll/templates/ph-statutory-2025.ts`: `PH_STATUTORY_2025`, the seed template for the "Philippines 2025" rule version (used at `scripts/seed.ts`, line ~445).
- `src/domains/payroll/payroll-attendance.ts`: `summarizeAttendance()` (rules in the Attendance section below).

**Models:**
- `src/server/db/models/payroll-rule-version.ts` `PayrollRuleVersionModel`: `taxTables[] {payFrequency, brackets[] {minIncome, maxIncome?, rate, baseDeduction}}`, `contributions[] {code, name, floor?, ceiling?, extraLabel?, rows[] {from, to?, employeeRate?, employerRate?, employeeAmount?, employerAmount?, extraAmount?}}`, `versionNumber`, `status`, `effectiveFrom`, `projectId?`.
- `src/server/db/models/payroll-policy.ts` `PayrollPolicyModel`: pay math parameters (`payFrequency`, `workDaysPerYear`, `hoursPerDay`, `workWeekDays`, `deductLateAndUndertime`, `contributionTiming`) and premiums (`overtimeMultiplier` default 1.25, `restDayMultiplier` default 1.3, `thirteenthMonthDivisor` default 12; range checks in the schema).
- `src/server/db/models/compensation.ts`: input rows (`rateType`, `rate`, `allowances[] {name, amount, basis, taxable}`, `minimumWageEarner`).

**Routes:** `src/app/api/payroll-rule-versions/` (GET, POST, PATCH `[id]`), `src/app/api/payroll-policies/` (GET, POST, PATCH `[id]`). Engine itself has no route; it runs inside `computeRun`.
**Pages:** `src/app/(app)/payroll/rule-versions/` (`page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `rule-version-editor.tsx`), `src/app/(app)/payroll/policies/` (`page.tsx`, `create-payroll-policy-dialog.tsx`, which shows premiums and the 13th-month divisor).

**Tests:**
- `tests/domains/payroll/payroll-engine.test.ts` (16 cases: rounding, contribution row matching and clamping, cutoffs, monthly and daily pay, mid-period proration, adjustments, rest-day warning, missing attendance, negative net pay).
- `tests/domains/payroll/payroll-tax.test.ts` (5), `payroll-attendance.test.ts` (3), `pay-premiums.test.ts` (10), `ph-statutory-template.test.ts` (4), `payroll-rule-version-service.test.ts` (7).
- `tests/lib/money.test.ts` (shared rounding).
- Cutoff tests (`pay-periods`, `pay-frequency`) are inside `payroll-engine.test.ts`; schedule-level behaviour is in `payroll-schedule-service.test.ts`.

**Rules a change must respect:**
- **Engine stays pure.** `computeEmployeePay` takes resolved inputs only, with no I/O (`compute-pay.ts`, header comment). Load data in `computeRun`, not here.
- **No rates in code.** Contribution and tax numbers come from rule data (`payroll-tax.ts` header; `contributions.ts` header; ENGINEERING § 28). Never add a `* 0.05`.
- **Rounding: half away from zero at centavos.** `roundMoney` scales by 100, re-reads at 12 significant digits to kill float noise, then rounds (`src/lib/money.ts`). Each line is rounded as produced; totals are `sumMoney` of rounded lines, so a payslip always adds up (`compute-pay.ts`, header comment; `engine/money.ts`).
- **Intermediate rates are rounded too.** `dailyRate`, `monthlyBasic` and `hourlyRate` are rounded to centavos before use. Tardiness uses the rounded `hourlyRate` (`compute-pay.ts`), so the rate rounding carries into pay.
- **Display matches the engine.** Format money through `formatMoney`/`formatAmount` only (`src/lib/money.ts`; `payroll-register-export.ts` uses `roundMoney`/`sumMoney`).
- **Monthly-rated pay.** Full month: `rate / periodsPerMonth` (`compute-pay.ts`, `basic`). Partial (`eligibleDays < scheduledDays`): `dailyRate × eligibleDays`. Absences: `dailyRate × absentDays`, deducted as a taxable earning line.
- **Daily rate.** Monthly-rated: `rate × 12 / workDaysPerYear` (261 for a 5-day week, 313 for 6, per ADR-029 and the policy default). Daily-rated: `monthlyBasic = rate × workDaysPerYear / 12`.
- **Daily-rated pay.** `dailyRate × (daysWorked + paidLeaveDays)`. Paid leave counts for daily-rated staff only (`compute-pay.ts`, `else` branch).
- **Tardiness and undertime** are deducted only when `policy.deductLateAndUndertime` is true, at the hourly rate × minutes ÷ 60 (`compute-pay.ts`, `tardiness`). Late minutes count only on "late" days; undertime is any check-out before the standard end (`payroll-attendance.ts`).
- **Allowances.** Monthly-basis allowances are `amount / periodsPerMonth`, scaled by eligible share for partial periods. Daily-basis allowances are `amount × daysWorked` (not paid leave) and skipped when `daysWorked` is zero (`compute-pay.ts`, allowance loop).
- **Contributions.** Base is the monthly basic pay (a daily rate's monthly equivalent for daily-rated staff), not the period's pay. Row matching uses the unclamped base; floor and ceiling clamp only the rate base (`contributions.ts`, `computeMonthlyContributionExact`). A row's fixed amount wins over its rate when set (`row.employeeAmount ?? rate × base`).
- **Contribution timing.** `every_cutoff` takes `1 / periodsPerMonth` each cutoff; `last_cutoff_of_month` takes the whole month on `isLastCutoffOfMonth` (`compute-pay.ts`, `contributionShare`; `pay-frequency.ts`). Weekly periods use 52/12 per month.
- **Taxable income.** Sum of taxable earning lines (including taxable adjustments), minus the employee's contributions, floored at zero (`compute-pay.ts`, `taxableIncome`). Non-taxable allowances and adjustments are excluded. Deductions (loans, cash advances) come after tax and are not taxable.
- **Withholding tax** uses the table for the policy's pay frequency only (`run-compute` finds `taxTables` by `payFrequency`). Minimum wage earners pay zero tax (`compute-pay.ts`, `tax`). Bracket lookup is `minIncome ≤ income < maxIncome`, then `baseDeduction + rate × (income − minIncome)` (`payroll-tax.ts`).
- **Net pay** = gross − (employee contributions + tax + other deductions) (`compute-pay.ts`, `netPay`). A negative net pay adds a blocking warning (`negative_net_pay`).
- **Warnings are data.** Codes produced: `missing_attendance` and `rest_day_work` (engine), `negative_net_pay` (blocking, engine), `pay_terms_changed` and `net_pay_change` (added in `computeRun`; net change threshold 20%, `NET_PAY_CHANGE_THRESHOLD` in `payroll-run-compute.ts`).
- **Effective dating by day.** A policy, rule version or pay term applies on a day if `effectiveFrom` ≤ end of that day and `effectiveTo` ≥ start of that day, status `active`, most recent `effectiveFrom` wins (`resolve-org-project-policy.ts`, `effectiveFilter`). Compensation rows are inclusive day ranges (`compensation-service.ts`, `appliesOn`).
- **Which date picks which rule.** Policy: pay period end. Rule version: pay date ("Tax and contribution rates follow the pay date", `payroll-run-service.ts`, `prepare`). Pay terms: period end (`computeRun`, `getAsOfForEmployees(end)`). A change inside the period uses the period-end terms for the whole period and warns.
- **Premiums are configuration.** `PAY_PREMIUM_DEFAULTS` are schema and read defaults, and `payPremiumsOf` fills them for older policies (`premiums.ts`). Keep old policies readable when adding a field.
- **Cutoffs.** Semi-monthly: a period ending on day ≥ 16 is the month's last cutoff (`pay-frequency.ts`). Weekly: last when the next period ends in another month.
- **Attendance reading** (`payroll-attendance.ts`, `summarizeAttendance`): only employed days count; workdays are the policy's `workWeekDays`; "absent" is unpaid; "on_leave" is paid leave; any other status is worked; no record is "missing" (reported, never guessed); work on non-workdays is `restDaysWorked`.
- **Rule versions are never edited in place** (ADR-014 Decision 2; `payroll-rule-version-service.ts`, `create`). Corrections create a new `versionNumber`.

**Known gaps / mismatches:**
- **Premium multipliers are not applied.** `overtimeMultiplier` is used only in UI text (`src/app/(app)/payroll/[id]/run-register.tsx`, "regular overtime is …"). `restDayMultiplier` appears only in a warning message (`compute-pay.ts`). Overtime, holiday pay, night differential and rest-day pay are HR-entered amounts (ADR-014 Decision 1; `adjustment-categories.ts`). The engine does not compute them.
- **13th-month divisor is used only by final settlement** (`src/domains/final-settlement/settlement-calculator.ts`, `thirteenthMonthDivisor`). Payroll runs do not compute 13th month pay; the ₱90,000 exemption is HR's job (`adjustment-categories.ts` header comment).
- **Effective dating vs. ENGINEERING § 27.** § 27 says historical calculations use the configuration applicable on their transaction date. A mid-period pay rate change applies the period-end terms to the whole period, with a warning only (`computeRun`; ADR-029 Consequences says so). Confirm this is the intended rule.
- **Overlapping rule versions are silently resolved.** No overlap check at create (`payroll-rule-version-service.ts`). The newest `effectiveFrom` wins.
- **Tax and contribution numbers need verification.** ADR-029 says the seed uses PH-accurate tables. ADR-014 says the seeded numbers are "illustrative example data, not authoritative". The template (`templates/ph-statutory-2025.ts`) has weekly, semi-monthly and monthly brackets and SSS, PhilHealth (2.5% + 2.5%, floor ₱10,000, ceiling ₱100,000) and Pag-IBIG (ceiling ₱10,000). This document does not verify the figures against official schedules.
- **Rate rounding in tardiness.** The rounded hourly rate is multiplied by minutes (`compute-pay.ts`), so the deduction can differ by centavos from an unrounded calculation. No doc states this choice.
- **No Philippine statutory rules beyond these tables** (e.g. night differential, holiday premium logic, de minimis caps) are computed. Categories carry only suggested taxable flags (`adjustment-categories.ts`).

**Last verified:** 6587050.
