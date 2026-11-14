# ADR-057: Computed overtime, rest-day, holiday and night pay

**Status:** Accepted, 2026-11-14 (attendance engine plan, Phase 5; formulas approved by the owner at GATE 3). Changes ADR-014 Decision 1 for these four categories on new runs.
**Context:** Overtime, rest-day pay, holiday pay and night differential were HR-entered adjustments (ADR-014). The engine had a rest-day multiplier it only quoted in a warning. With the stored day result (ADR-056) the inputs exist.

## Decision

1. **A per-run switch.** `PayrollRun.computePremiums` is set on every new regular run. Runs made before it don't have it and recompute exactly as before (status-based late and undertime, the `rest_day_work` reminder, manual premiums). Finished runs are never recomputed.
2. **Rates are policy data.** `PayrollPolicy` gains optional, effective-dated multipliers with Philippine defaults in `PAY_PREMIUM_DEFAULTS`, filled for older policies by `payPremiumsOf`: special day 1.3, special day on a rest day 1.5, regular holiday 2.0, regular holiday on a rest day 2.6, overtime on a premium day 1.3 (times the day's rate), night differential 0.10; the existing overtime 1.25 and rest day 1.3 stay.
3. **Formulas** (`src/domains/payroll/engine/premium-pay.ts`, pure):
   - Regular hours on a premium day: daily rate × multiplier × regular minutes ÷ (hours per day × 60). When basic pay already covers the day (it is in the payroll policy's work week) only the extra (multiplier − 1) is added. A day outside the work week counts as a rest day for pay.
   - Overtime: hourly rate × 1.25 on an ordinary day, or × the day's multiplier × 1.3 on a premium day. **Only approved overtime is paid.**
   - Night differential: hourly rate × the day's multiplier × 0.10, and for night minutes that are also overtime, × the overtime rate × 0.10.
   - Minutes are summed per kind of day over the period: one line per kind and pay type, rounded as produced, totals by `sumMoney`. Line codes reuse the adjustment categories (`overtime`, `rest_day_pay`, `holiday_pay`, `night_differential`), so taxable flags come from `adjustment-categories.ts`.
   - Worked example (₱25,000 a month, 261 days, 8 hours; daily ₱1,149.43, hourly ₱143.68), reproduced to the centavo in `tests/domains/payroll/premium-pay.test.ts`: 2 h ordinary overtime ₱359.20; 8 h rest day ₱1,494.26; 8 h regular holiday extra ₱1,149.43; 8 h night on a workday ₱114.94.
4. **Holidays not worked.** A day-off holiday is neither missing nor an absence. A regular holiday on a workday is paid to daily-rated staff (one daily rate) when the workday before was attended or on approved leave; monthly-rated staff already have it in basic. Absent the day before: a warning, never a deduction (owner decision).
5. **No double counting.** On such runs the four manual categories are refused by `addAdjustment` and hidden from the form; any already present raise a blocking `manual_premium_adjustment` warning.
6. **Warnings as data:** `unapproved_overtime`, `missing_checkout`, `day_result_missing` (a timed record without a stored result), `holiday_absent_before`.
7. **Snapshot.** Each record stores `premiumInputs`: `PREMIUM_ENGINE_VERSION`, the payroll policy id, the rates and holiday mapping used, the per-day minutes with the attendance record id and `calcVersion`, and the counters. A later attendance correction can't change what a finished run says it paid.

## Consequences

- The percentages follow the DOLE handbook figures and were approved at GATE 3, but have not been checked against the official Labor Code text (Arts. 86, 87, 93, 94 and the implementing rules). Verify before relying on them (`knowledge/philippine-payroll-compliance.md`).
- A draft made before this change keeps manual premiums until it is prepared again.
- An unworked regular holiday on a rest day isn't paid to daily-rated staff; two regular holidays on one day (300%) aren't supported.
- Results computed under `DAY_CALC_VERSION` 1 pay night overtime at the ordinary night rate until that range is recalculated.
