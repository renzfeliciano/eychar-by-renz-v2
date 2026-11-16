# ADR-060: Year-end tax adjustment run and Form 2316 data

**Status:** Accepted, 2026-11-14 (payroll plan Phase 4, Gate C approved by the owner as drafted). Design: `knowledge/plans/payroll-enhancement.md`, Appendix B.
**Context:** Withholding per payslip uses per-period tables, so a year's tax withheld rarely equals the annual tax due. The employer must settle the difference and give each employee BIR Form 2316 data. Nothing did this.

## Decision

1. **Its own run type, `year_end_adjustment`** (ADR-058), one per year and scope, prepared only after every regular run of the year is approved, released or cancelled. HR reviews and approves it; nothing is applied silently.
2. **Annualization** (`engine/year-end-tax.ts`, pure): annual taxable income = the true sum of the year's taxable lines from finished runs, less contributions, plus any previous employer's income this year (`PriorEmployment`, entered by HR). Tax due comes from the **annual TRAIN table in the rule version**, never code. The difference with tax withheld (here and at the previous employer) is a refund (a non-taxable earning line) or a collection (the record's tax).
3. **The ₱90,000 cap on 13th month and other benefits is applied here** (Gate C): the cap is rule data; any excess becomes taxable.
4. **Form 2316 boxes are rule data:** the rule version maps line codes to boxes (first match wins; `@contributions` and `*` are reserved codes). Unmapped codes are listed on the record so HR can see them.
5. **Employer BIR details live on the organization** (TIN, RDO, address; `/payroll/employer`).
6. **Separated employees are left to final pay**, which runs the same annualization (ADR-061).
7. **Snapshot:** each record stores the annualization, the box amounts and the source runs (§46).
8. **Reports:** the run exports the reconciliation, the Form 2316 data and the Annex F list of employees qualified for substituted filing (XLSX or CSV), audited like the register export.

## Consequences

- A collection larger than the record's pay shows as negative net pay; HR deducts it from a later payslip (gaps B26).
- Box numbers, Annex F columns and the annual table come from secondary sources (gaps B25).
- A printable Form 2316 and e-filing are out of scope.

## Addendum, 2026-11-16: employee RDO and ZIP removed

The owner removed the employee RDO code and ZIP code from the employee profile (they are not part of the employee information the system keeps; see `knowledge/plans/employee-ids-and-licenses.md`). The Form 2316 data export therefore no longer has items 5 (RDO code) and 6A (ZIP code); HR completes them outside the system. Decision 5 stands: the employer's TIN, RDO, address and ZIP stay on the organization, and the previous-employer ZIP stays on `PriorEmployment`.
