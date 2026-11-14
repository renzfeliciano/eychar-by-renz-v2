# Phase 4 design: year-end tax and Form 2316 data (Gate C draft)

**Status:** Gate C approved as drafted, 2026-11-14 (owner). The [verify] marks stay open as legal checks (gaps file).
Decisions:
- Q2: the employer's BIR details live on the organization.
- Q3: the ₱90,000 cap is applied at year-end, as rule data.
- Q6: the annual base is the true annual sum.
- Q4 (true-up year) and Q5 (allowance boxes) take the defaults: the year the true-up is for, and the default allowance map. Parent plan: [payroll-enhancement.md](./payroll-enhancement.md)
Phase 4 and §5 item 3.

**How to read the source marks.**
- **[verify]**: from my knowledge of BIR Form 2316 (January 2018 version, RR 11-2018). Not checked against the official
  form or issuance in this pass.
- **Have**: the field exists in the system today.
- **New**: a field this phase adds.

Item numbers are the form's box numbers as I remember them. Gate C means checking every line against the current form
on bir.gov.ph before anything is built.

## Shape

- **Run type `year_end_adjustment`** (Gate A): one per calendar year per scope.
  - Same lifecycle and permissions as a regular run.
  - It can be prepared only after every regular run whose period ends in the year is approved or released (the same
    guard as the 13th-month true-up).
  - The pay date is HR's choice: the last December pay, or January for a refund **[verify]**.
- **One record per employee**, with one line:
  - **Under-withheld:** a `year_end_tax` **deduction**, labelled "Withholding tax YYYY (year-end)".
  - **Over-withheld:** a non-taxable **earning**, labelled "Tax refund YYYY".
  - Nothing else: no contributions and no other deductions.
  - Employees with no difference are listed with ₱0.00 so the reconciliation is complete.
  - HR approves the run. Nothing is applied silently.
- **Snapshot on the record** (§46):
  - every annualization figure in the formula below;
  - the rule version id used;
  - the ids of the source runs;
  - the previous-employer input id.
- **Who is in it:** employees with an approved or released regular record in the year who are still employed on
  December 31.
  - Separated employees are annualized in their final settlement (Phase 5), so this run lists them as excluded with
    that reason.
  - They still appear in the Form 2316 export.
- **Exports**, all audited like `auditExport`:
  1. the reconciliation report;
  2. the Form 2316 data, one row per employee;
  3. the BIR Annex F list of employees qualified for substituted filing.
  - A printable 2316 stays a follow-up.

## Annualization (RR 11-2018, the employer's December duty [verify])

```
benefits excess   = max(0, Σ non-taxable 13th-month and bonus lines (incl. the 13th-month run) − benefits cap)
                    (cap is rule data; Q3)
present taxable   = max(0, Σ taxable earning lines − Σ employee contributions + benefits excess), over the year's
                    approved/released regular runs (true annual sum, not Σ record.taxableIncome; Q6)
gross taxable     = present taxable + previous-employer taxable (new input)
annual tax due    = roundMoney(progressive tax on gross taxable, using the rule version's ANNUAL table)
withheld          = Σ record.tax (present) + previous-employer tax withheld
difference        = annual tax due − withheld      > 0 → collect   < 0 → refund   0 → none
```

- **Minimum wage earners:** tax due 0, so any amount withheld is refunded. This only happens if the flag changed
  mid-year.
- **Annual table:** today a rule version holds weekly, semi-monthly and monthly tables only.
  - It needs a new `annual` entry. Rule versions are never edited in place, so HR adds a new version with it.
  - The starter template gets the TRAIN annual brackets (2023 onward):
    - 0% up to ₱250,000;
    - 15% of the excess over ₱250,000;
    - ₱22,500 + 20% over ₱400,000;
    - ₱102,500 + 25% over ₱800,000;
    - ₱402,500 + 30% over ₱2,000,000;
    - ₱2,202,500 + 35% over ₱8,000,000.
  - These are in the compliance file, from secondary sources **[verify]**.
  - The year uses the rule version in force on December 31 for the scope.
  - If that version has no annual table, prepare refuses: "Add the annual tax table to a new rule version first."
- **Settlement deadlines:**
  - Collect from the December pay; any balance by January 25 of the next year **[verify]**.
  - Refund by January 25 **[verify]**.
  - These are guidance on the run, not a block.

## Previous employer (new, per employee and year)

`PriorEmployment` is entered by HR from the previous employer's 2316. It holds:

- year;
- employer TIN, name, registered address, ZIP;
- period from and to;
- taxable compensation;
- non-taxable compensation;
- tax withheld;
- "concurrent employer" (yes/no).

It is audited, editable only until the year-end run of that year is approved, and shown on the employee's payroll
tab. One or more entries mean the employee **had two or more employers**: they are flagged and left off Annex F.

## Form 2316 field list

### Part I: Employee

| Box | Field | Source |
|---|---|---|
| 1 | For the year | run year |
| 2 | Period from / to (MM/DD) | first and last day employed in the year (employment dates, clamped) |
| 3 | TIN | **Have:** `Person.tinNumber` (free text; validate as 9 or 12 digits) |
| 4 | Name (last, first, middle) | **Have:** `Person` name fields |
| 5 | RDO code | **New:** `Person.rdoCode` |
| 6, 6A | Registered address, ZIP | **Have:** `Person.address` (one string). **New:** `Person.zipCode` |
| 6B–6D | Local home address, ZIP, foreign address | **Have, partly:** reuse `address`; foreign address not needed for now **[ask]** |
| 7 | Date of birth | **Have:** `Person.birthDate` |
| 8 | Contact number | **Have:** `Person.phone` |
| 9, 10 | Statutory minimum wage per day and per month (MWE only) | **Have:** `Compensation` rate when `minimumWageEarner` (the monthly figure uses the policy's days per year ÷ 12) |
| 11 | Minimum wage earner | **Have:** `Compensation.minimumWageEarner` (any MWE period in the year **[verify how a mixed year is shown]**) |

### Part II: Present employer

| Box | Field | Source |
|---|---|---|
| 12 | TIN | **New:** `Organization.tax.tin` |
| 13 | Employer name | **Have:** `Organization.name` (**New:** optional `Organization.tax.registeredName` when the BIR name differs) |
| 14, 14A | Registered address, ZIP | **New:** `Organization.tax.registeredAddress`, `zipCode` |
| 15 | Main or secondary employer | **New:** derived. Secondary when the prior-employment entry is marked concurrent **[verify]** |

### Part III: Previous employer(s)

Boxes 16–18A: TIN, name, address and ZIP, from `PriorEmployment`. The form has one block, so the export lists the
first and adds a column with the rest.

### Part IV-A: Summary

| Box | Field | Formula |
|---|---|---|
| 19 | Gross compensation, present employer | box 38 + box 52 |
| 20 | Less non-taxable/exempt, present | box 38 |
| 21 | Taxable, present | box 52 (equals present taxable above) |
| 22 | Add taxable, previous employer | `PriorEmployment` |
| 23 | Gross taxable compensation | 21 + 22 |
| 24 | Tax due | annual tax due |
| 25A, 25B | Tax withheld, present / previous | Σ `record.tax` + the year-end line / `PriorEmployment` |
| 26 | Total withheld as adjusted | 25A + 25B, after the year-end adjustment |
| 27 | 5% tax credit (PERA) | 0. Not supported, stated in the export |
| 28 | Total taxes withheld | 26 + 27 |

### Part IV-B: Details from the present employer (which pay line goes to which box)

The mapping is **rule data**: a new `form2316Boxes` list on the rule version (box ← earning codes or adjustment
categories, with an MWE switch). It is not code, because BIR renumbers forms.

Proposed starting map:

| Box | Field | Pay lines |
|---|---|---|
| 29 | Basic salary (incl. MWE's statutory minimum wage, or basic ≤ ₱250,000 **[verify]**) | MWE: `basic`, `absences`, `tardiness` |
| 30–33 | Holiday pay, overtime, night shift differential, hazard pay (MWE only) | MWE: `holiday_pay`, `rest_day_pay` **[ask: 30 or 31]**, `overtime`, `night_differential`, `hazard_pay` |
| 34 | 13th month pay and other benefits (exempt up to ₱90,000) | non-taxable `thirteenth_month` and `bonus` lines |
| 35 | De minimis benefits | non-taxable `allowance` lines, `de_minimis` |
| 36 | SSS, GSIS, PhilHealth, Pag-IBIG contributions and union dues (employee share) | employee contributions |
| 37 | Salaries and other forms of compensation (non-taxable) | any other non-taxable earning |
| 38 | Total non-taxable | Σ 29–37 |
| 39 | Basic salary (taxable) | non-MWE: `basic`, `absences`, `tardiness` |
| 40–43 | Representation, transportation, COLA, fixed housing allowance | none by default (allowances are free-named; HR maps by name later **[ask]**) |
| 44 | Others (taxable regular) | taxable `allowance` lines |
| 45–47 | Commission, profit sharing, fees | none by default |
| 48 | Taxable 13th month and other benefits | taxable `thirteenth_month` and `bonus` lines |
| 49, 50 | Hazard pay, overtime pay | non-MWE: `hazard_pay`; `overtime`, `holiday_pay`, `rest_day_pay`, `night_differential` **[ask]** |
| 51 | Others (taxable supplementary) | `retro_pay`, `other_earning`, any other taxable earning |
| 52 | Total taxable | Σ 39–51, less box 36 **[verify: whether contributions come off 39 or are shown only in 36]** |

**Not compensation, never on the form:**
- `reimbursement`;
- every deduction other than contributions and tax (loans, cash advances);
- the "Tax refund" line itself.

**Cap at year-end (Q3):** box 34 holds non-taxable 13th-month and bonus pay up to the cap. Any excess moves to box 48
and is taxed in the annualization.

**Check on export:** box 52 must equal present taxable from the annualization. Any difference is shown on the export
as a warning, never hidden.

### Annex F: employees qualified for substituted filing [verify columns]

The columns are: sequence, TIN, last name, first name, middle name.

An employee qualifies when all of these are true:
- they were with this employer only, for the whole year they were employed (no `PriorEmployment` entry);
- they are on the year-end run;
- annual tax due equals tax withheld after the year-end adjustment.

HR can exclude an employee with a reason (for example, other income it doesn't know about). The exclusion is recorded
in the run's history.

## Hand-worked examples (semi-monthly policy, contributions every cutoff)

| | A: full year, no prior employer | B: hired Jul 1, prior employer Jan–Jun | C: minimum wage earner |
|---|---|---|---|
| Pay terms | ₱30,000/month | ₱40,000/month; prior 2316: taxable ₱180,000, tax withheld ₱0 | ₱650/day, MWE |
| Contributions/month | SSS 1,500 + PhilHealth 750 + Pag-IBIG 200 = 2,450 | 1,750 + 1,000 + 200 = 2,950 | (per table) |
| Per-cutoff taxable | 15,000 − 1,225 = 13,775.00 | 20,000 − 1,475 = 18,525.00 | n/a |
| Per-cutoff tax | 15% × (13,775 − 10,416.67) = 503.75 | 937.50 + 20% × (18,525 − 16,666.67) = 1,309.17 | 0 |
| Present taxable (year) | 360,000 − 29,400 = 330,600.00 | 240,000 − 17,700 = 222,300.00 | 0 (all in boxes 29 and 36) |
| Gross taxable | 330,600.00 | 222,300 + 180,000 = 402,300.00 | 0 |
| Annual tax due | 15% × 80,600 = 12,090.00 | 22,500 + 20% × 2,300 = 22,960.00 | 0 |
| Withheld | 24 × 503.75 = 12,090.00 | 12 × 1,309.17 = 15,710.04 + 0 | 0 |
| **Year-end line** | **none** | **collect 7,249.96** | **none** |
| Annex F | qualifies | no (two employers) | qualifies |

Example B shows why the prior-employer input matters. Without it, the present employer alone would annualize ₱222,300
(below ₱250,000), find ₱0 due and refund ₱15,710.04 wrongly.

## Questions for the owner at Gate C

1. **Check against the current BIR forms:**
   - the 2316 box list and numbering above;
   - the Annex F columns;
   - the annual table;
   - the January 25 deadlines.
2. **Where the employer's TIN, RDO and address live.** Proposed: on the organization, as one BIR employer. Ask if any
   project is a separate BIR-registered employer.
3. **The ₱90,000 cap at year-end.** It was deferred for per-period pay. Annualization reads every 13th-month and
   bonus line anyway, so it could apply the cap here at almost no cost: any excess becomes taxable and is collected in
   the year-end line, with the cap stored as rule data. **Recommended**, but it reverses the Phase 3 deferral, so it
   is your call.
4. **Which year a January 13th-month true-up counts for on the 2316:** the year it is for (`thirteenthMonthYear`) or
   the year it is paid. It is non-taxable either way; this only moves box 34. **[verify]**
5. **The allowance mapping:** default as above (non-taxable to box 35, taxable to box 44), with HR mapping named
   allowances to boxes 40–43 later. Or should the allowance form get a 2316 box now?
6. **Negative per-period taxable** (a cutoff with more contributions than taxable pay) is floored at 0 today, so the
   difference is lost.
   - The annual figure could instead use the true annual sum (taxable earnings − contributions).
   - **Recommended: true annual sum.** It is what the form's boxes add up to.
