# ADR-061: Final pay as a payroll run, with a fingerprint and checks

**Status:** Accepted, 2026-11-14 (payroll plan Phase 5, Gate D approved by the owner). Completes ADR-032. Design: `knowledge/plans/payroll-enhancement.md`, Appendix C.
**Context:** ADR-032's final settlement computed lines and had maker-checker on approve only. It created no payroll record, so final pay was missing from payslips, registers and the year's tax, and nothing showed whether an approved settlement changed before it was paid.

## Decision

1. **Disbursing creates a `final` run** (ADR-058), already released, with one record carrying the settlement's lines, contributions and tax. It is written in the same transaction that marks the settlement disbursed and closes the clearance (ADR-041). The record stores the settlement id, version, fingerprint and last working day.
2. **Fingerprint:** plain SHA-256 (owner: no key) over canonical JSON of version, employee, clearance, lines, totals, inputs and manual lines: sorted keys, amounts to the centavo, dates as ISO strings, the compute time left out (`settlement-hash.ts`). Approve stores it; disburse recomputes it and refuses on a mismatch, auditing `final-settlement.hash-mismatch`. It catches edits made outside the workflow, not someone who can rewrite both the data and the fingerprint. A settlement approved before fingerprints existed is paid with a history note.
3. **Statutory pieces use the engine, not copies** (`settlement-statutory.ts`): contributions still due for the last month and the year's tax true-up (the annualization of ADR-060). Leave converted to cash is non-taxable up to `deMinimisLeaveDays` a year (rule data).
4. **Checks as data** (`final-pay-checks.ts`): negative net, leave over the limit, 13th month already paid or pending, recent pay change, missing government IDs, tax true-up, employment not ended, unfinished payroll and changed inputs. Each is blocking, warning or off per payroll policy (`finalPayChecks`), with defaults in `FINAL_PAY_CHECK_DEFAULTS`. Blocking checks stop forward actions.
5. **Segregation of duties:** the preparer can't review or approve, and the approver ticks each warning (`acknowledgedWarnings`).
6. **Manual lines need a reason and a document** of that employee (existing document storage), and earnings say whether they are taxable.
7. **One deadline source:** `PayrollPolicy.finalPayDeadlineDays`; the dashboard falls back to `Organization.compliance.finalPayDays` only when no policy applies.

## Consequences

- Regular runs leave out days a final run paid (ADR-058).
- The legal checks (DOLE 30-day rule, de minimis limit, partial-month contribution base) are open (gaps B25).
