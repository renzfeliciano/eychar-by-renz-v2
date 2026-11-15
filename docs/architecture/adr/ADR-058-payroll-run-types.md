# ADR-058: Payroll run types and the type-aware double-pay guard

**Status:** Accepted, 2026-11-14 (payroll plan Phase 2, Gate A approved by the owner). Extends ADR-029.
**Context:** Every payroll run was a regular period run, and `assertNoOverlap` refused any two runs over the same dates and people. The 13th month, the year-end tax adjustment and final pay each need a run of their own that pays something a regular run doesn't, over dates a regular run already covers.

## Decision

1. **`PayrollRun.runType`:** `regular`, `thirteenth_month`, `year_end_adjustment` or `final`. It is optional on the document: a run saved before run types existed reads as `regular` everywhere (`runTypeOf`), so no backfill.
2. **One lifecycle.** All types share the state machine (`TRANSITIONS`), the permissions (prepare `payroll-runs.create`, then submit, approve, release) and the audit actions; the run type is in the audit metadata. A final run is the exception that is created already released (ADR-061).
3. **Type-aware overlap guard** (`runsConflict` in `payroll-run-guards.ts`):
   - Runs of different types never conflict.
   - Regular, 13th month and year-end: two runs of the same type conflict when their dates overlap and their scopes overlap (an organization-wide run overlaps any run; a project run overlaps organization-wide runs and the same project).
   - Final: two final runs for the same employee conflict, whatever their dates.
   - Cancelled runs don't count. The guard runs before insert and again after it (`createdBefore`), so two concurrent prepares can't both pass.
4. **Days already paid in final pay are never paid again:** a regular run leaves out an employee whose approved or released final run covers its dates, with the exclusion reason naming that run.
5. **Every screen names the type:** run list, run page, payslips, register export subtitle and the employee profile's payslip list (`runTitle`).

## Consequences

- The double-pay risk between types is handled by each type's own rules instead of the date guard: the 13th month reads an "already paid" ledger shared with final pay (ADR-059), the year-end run leaves separated staff to final pay (ADR-060), and final pay checks for unfinished regular and 13th-month runs (ADR-061).
- Tests: `tests/domains/payroll/payroll-run-overlap.test.ts` covers every pair of types.
