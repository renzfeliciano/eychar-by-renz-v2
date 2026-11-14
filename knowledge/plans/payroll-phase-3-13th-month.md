# Phase 3 design: 13th-month run (Gate B draft)

**Status:** Gate B approved 2026-11-14 (owner): build on this base; December is estimated, then trued up in January.
Built 2026-11-14 (uncommitted at the time of writing): `engine/thirteenth-month.ts`, `thirteenth-month-compute.ts`,
`thirteenth-month-ledger.ts`, `thirteenth-month-report.ts`, `PayrollRunService.prepareThirteenthMonth` and
`addThirteenthMonthTrueUp`, the "13th month" button on Payroll runs and the true-up button on January drafts. The final
settlement now reads "already paid" from the same ledger. Legal check of the base and the DOLE fields still open (gaps B24). Parent plan: [payroll-enhancement.md](./payroll-enhancement.md) Phase 3.

## Shape

- **Run type `thirteenth_month`** (Phase 2), one per calendar year per scope. Period = Jan 1 – Dec 31.
  Same lifecycle and permissions as a regular run (prepare `payroll-runs.create`, submit, approve, release).
- **Due date is policy data:** new optional `PayrollPolicy.thirteenthMonthPayBy` (month-day, default `12-24`).
  Prepare warns (not blocks) when the pay date is after it.
- **Who is paid:** every employee with basic pay in an approved or released **regular** run whose period ends in
  the year. Managerial staff included (company policy, not PD 851 coverage; say so in the ADR).
- **Base:** sum of the `basic`, `absences` and `tardiness` earning lines from those records. These lines are
  already net of unpaid absence and tardiness, and they already exclude overtime, premiums, allowances and
  adjustments (those are separate lines). This is the same base the final settlement uses today
  (`final-settlement-service.ts`, `BASIC_CODES`); it moves into one shared function used by both.
- **Amount** = `roundMoney(base ÷ thirteenthMonthDivisor − already paid)`, floored at zero.
  **Already paid** = `thirteenth_month` adjustments in regular runs that year + the `thirteenth_month` line of
  any approved or disbursed final settlement that year. An employee whose final settlement covered it gets 0 and is
  listed as excluded, with the reason.
- **Record:** one earning line `thirteenth_month`, **non-taxable** (today's behavior; the ₱90,000 cap is deferred,
  risk recorded), no SSS/PhilHealth/Pag-IBIG, no withholding, no other deductions. Net = amount.
- **Snapshot on the record:** base earned, divisor, already paid, months with pay, and the ids of the source runs, so
  the record reproduces (§46).
- **Report:** XLSX/CSV export with the data for DOLE's annual 13th-month report (employee, base, amount, paid on).

## Hand-worked examples (monthly policy: 261 workdays/year, 8 h/day, divisor 12)

Engine rounding: daily rate = round(monthly × 12 ÷ 261); hourly = round(daily ÷ 8); each line rounded.

| | A: full year | B: hired mid-year, raise in Nov | C: resigned Jun 30 |
|---|---|---|---|
| Pay terms | ₱30,000/month all year | ₱24,000/month from Aug 17 (Mon); ₱26,000 from Nov 1 | ₱650/day (daily-rated) |
| Basic lines | 12 × 30,000 = 360,000.00 | Aug: 11 of the month's workdays × 1,103.45 = 12,137.95; Sep–Oct 2 × 24,000; Nov–Dec 2 × 26,000 → 112,137.95 | 126 days paid (129 weekdays Jan–Jun, 3 unpaid absences) × 650 = 81,900.00 |
| Absences | 2 days × 1,379.31 = −2,758.62 | none | (daily-rated: unpaid days are simply not paid) |
| Tardiness | 60 min × 172.41 ÷ 60 = −172.41 | none | none |
| Excluded (not in base) | ₱5,000 overtime, ₱1,500/month rice allowance | none | none |
| **Base** | **357,068.97** | **112,137.95** | **81,900.00** |
| **13th month** (÷ 12) | **29,755.75** | **9,344.83** | **6,825.00**, paid in final pay; the December run lists C as excluded ("paid in final settlement") |

## For the owner to confirm at Gate B

1. The base above against PD 851 and its implementing rules: "basic salary" excludes overtime, premiums, night
   differential, holiday pay and allowances not integrated into the basic salary; unpaid absences reduce it.
   **Not verified against the official text in this pass.**
2. December's last cutoff: **decided** (owner, 2026-11-14): estimate the unpaid rest of the year at current terms (full
   attendance, by the policy's pay periods), then true up in January's first regular run as a 13th-month adjustment tagged
   with the year it belongs to (`PayrollAdjustment.thirteenthMonthYear`), for HR to approve with that run.
3. The DOLE report due date (January 15) and its required fields.
