# ADR-059: 13th-month pay for every employee

**Status:** Accepted, 2026-11-14 (payroll plan Phase 3, Gate B approved by the owner). Design: `knowledge/plans/payroll-enhancement.md`, Appendix A.
**Context:** The 13th month (PD 851) was an HR-entered adjustment. Nothing computed it, checked the December 24 deadline, or stopped it being paid twice through a regular run, a separate run and final pay.

## Decision

1. **A `thirteenth_month` run** (ADR-058) per calendar year and scope. It is due by `PayrollPolicy.thirteenthMonthPayBy` (month-day, default December 24, policy data); a later pay date needs a note.
2. **Base:** basic salary earned in the year, read from released and approved regular records: the `basic` lines net of absences and tardiness. Overtime, premiums, allowances and other adjustments are out. Amount = base ÷ `thirteenthMonthDivisor` (policy data, default 12), rounded with `roundMoney`.
3. **December is estimated, then trued up** (owner): pay not yet in an approved run is estimated from the pay terms (assumes full attendance, a warning says so), and `addThirteenthMonthTrueUp` adds the difference to a January draft.
4. **Mandatory for every employee, with no eligibility setting** (owner). PD 851 doesn't cover managerial staff by statute, so for them it is a company benefit. Employees who left mid-year get the pro-rated amount through final pay.
5. **One "already paid" ledger** (`thirteenth-month-ledger.ts`) for the run, the true-up and final pay, so none pays what another already did.
6. **Snapshot:** each record stores basic earned, the estimate, divisor, already paid, months with pay and the source runs (§46).
7. **The line is non-taxable**, as the `thirteenth_month` adjustment always was. Tracking the ₱90,000 exemption per payslip was deferred (owner); the year-end run and final pay apply the cap (ADR-060).
8. **DOLE report data:** a 13th-month run exports the fields of DOLE's annual report instead of a register.

## Consequences

- Between payslips, a 13th month above ₱90,000 is untaxed until the year-end run taxes the excess (gaps B23).
- The base and the DOLE fields follow secondary sources; HR or counsel should check them against the official texts (gaps B24).
