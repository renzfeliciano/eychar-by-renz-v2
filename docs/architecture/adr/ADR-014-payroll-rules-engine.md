# ADR-014: Payroll rules engine & run atomicity

## Status

Accepted

## Context

AGENTS.md §28 is explicit about Payroll: it "must be a configurable rules engine," must never
hardcode a formula like `salary * 0.05`, and every result "must be reproducible" (Policy
Version, Rules Used, Inputs, Calculation Results, Adjustments, Approvals all identifiable after
the fact). §28 also says the architecture should support Philippine payroll requirements
"without making the entire platform permanently hardcoded to Philippine law" — country-specific
numbers belong in policy/rule *data*. §33 separately names "Payroll Finalization" as an
operation that may need atomicity, alongside Employee Transfer, which ADR-005 already declined
to wrap in a transaction on MVP-restraint grounds.

Three scope/architecture decisions were made explicitly (asked and confirmed) before building
this phase, because each trades a real capability for real restraint:

## Decision 1: Two computed line items, the rest are HR-supplied adjustments

`AttendanceRecord` doesn't track hours worked precisely enough to derive overtime or night
differential pay, and no `HolidayCalendar` model exists to know which days are holidays.
Building either would be new infrastructure this phase doesn't otherwise need. So:

- **Computed automatically** by the rules engine: Basic Salary (prorated against unpaid
  absences) and Tax + Statutory Contributions (via a generic progressive-bracket formula applied
  to seeded `PayrollRuleVersion` data). These are exactly the two categories AGENTS.md's own
  warning is about — nobody should ever see `income * 0.15` written in application code, and
  nobody does; `computeProgressiveBracketTax()` (`src/domains/payroll/payroll-tax.ts`) takes the
  bracket table as a parameter and works for any country's shape.
- **HR-supplied, audited line items**: Overtime, Holiday Pay, Night Differential, Bonuses, 13th
  Month, Loans, Other Deductions — entered as `PayrollAdjustment` rows (`category`, `direction:
  "addition" | "deduction"`, `amount`) at run-generation time. All 12 of §28's listed categories
  are representable and auditable; only the two hardest-to-hardcode-safely ones are automated.

## Decision 2: `PayrollPolicy` + `PayrollRuleVersion`, resolved independently

AGENTS.md's own suggested concepts (`PayrollPolicy`, `PayrollRule`, `PayrollRuleVersion`) are
collapsed to two models here, not three — a version *is* the versioned bundle of rules (tax
brackets + statutory contributions together), the same way `AttendancePolicy` bundles
`standardStartTime`/`gracePeriodMinutes`/`workDays` into one document rather than separate child
rows. `PayrollPolicy` holds the structural, mostly country-agnostic parameters (`payFrequency`,
`standardWorkDaysPerPeriod`); `PayrollRuleVersion` holds the country-varying numbers. Both are
org/project-scoped and effective-dated, and both resolve via the existing
`resolveOrgProjectPolicy()` (`src/server/policies/resolve-org-project-policy.ts`, extracted in
Phase 6/ADR-011) — this is the resolver's third caller, after `AttendancePolicyService` and
`LeavePolicyService`, reusing the same day-granular effective-dating widening without either
resolver needing to know about the other. `PayrollRun` snapshots both resolved IDs
(`policyId`/`ruleVersionId`) at generation time, so a run keeps identifying exactly what was
used even after the organization's active policy or rule version later changes — this *is*
§28's reproducibility requirement, not a separate mechanism bolted on to satisfy it.

`PayrollRuleVersion` is never edited in place. A correction creates a new version with the next
auto-incremented `versionNumber` — the same transfer-mechanic spirit as every other
effective-dated model in this codebase (`EmployeeAssignment`, `Compensation`).

## Decision 3: Precompute-then-persist instead of a Mongo transaction

`PayrollService.generateRun()` computes every employee's full record (basic salary, gross pay,
tax, statutory deductions, net pay) in memory first — pure calculation, no database writes. If
any one employee's inputs don't resolve (no `Compensation` as of the pay period, or the org has
no applicable policy/rule version), the whole call throws before anything is persisted. Only
once every record is ready does generation create the `PayrollRun` row and `insertMany` the
`PayrollRecord`/`PayrollAdjustment` rows; if that insert step itself fails, the just-created run
and any partially-inserted rows are best-effort deleted and the error rethrown.

This was a genuine trade-off, not a default: a real Mongo transaction would be more strictly
atomic, but this codebase has zero transactions anywhere today, and adding one here would mean
switching `tests/global-setup.ts` from a standalone `mongodb-memory-server` instance to a
single-node replica set — the first transaction-capable test infrastructure in the codebase,
touching every existing test file's shared database setup, not just Payroll's. ADR-005 already
made the same call for Employee Transfer's two sequential writes, on the same MVP-restraint
grounds (AGENTS.md §33: "use transactions only where necessary," §63: "do not prematurely
introduce infrastructure"). The precompute-then-persist guard closes the practical risk this
phase actually has — a partially-computed run never gets written at all — while the narrow
remaining risk (the bulk insert itself failing, e.g. a concurrent duplicate-run race) is the same
class of rare edge case ADR-005 already accepted elsewhere.

## Consequences

- `tests/domains/payroll/payroll-service.test.ts` proves the guard directly: when one employee
  has no resolvable `Compensation`, `generateRun()` throws and the test asserts zero
  `PayrollRecord`s exist afterward for that organization — not just that the call rejected.
- If Payroll ever needs true multi-document atomicity in practice (a partial-failure incident is
  actually observed), that is the concrete trigger to introduce this codebase's first
  transaction and upgrade the test infrastructure accordingly — not a preemptive one.
- The seeded illustrative `PayrollRuleVersion` (PH-shaped tax brackets and SSS/PhilHealth/
  Pag-IBIG-shaped contributions, `scripts/seed.ts`) is explicitly labeled as example data, not
  authoritative rates — it exists to make the feature demonstrable end-to-end, not to make this
  platform Philippine-law-specific. A different organization would configure its own
  `PayrollRuleVersion` with its own numbers through the same UI, no code change required.
