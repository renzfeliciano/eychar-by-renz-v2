# Philippine payroll and tax compliance

**Checked:** 2026-11-14, against commit `6587050` plus the changes listed in §5.
**Scope:** contributions (SSS, PhilHealth, Pag-IBIG), withholding tax, 13th-month pay, premium pay,
pay frequency, final pay, and the year-end tax step.

## 1. How to read this

- **Code ✓** means the rule is in the code and matches the law as stated here.
- **HR entry** means the engine doesn't compute it. HR enters it as a payroll adjustment, so the
  rule holds only if HR enters the right amount.
- **Gap** means the code doesn't implement it and nothing warns about it.
- **Verify** means I couldn't confirm the figure against an official issuance (see §6).

Rules are stated from the Labor Code, PD 851, the TRAIN law and the agency rules as I know them. The
searches I ran returned mostly secondary sites (calculator and guide sites, a few payroll vendors),
so **every figure here needs checking against the official text before it is relied on for pay.**

## 2. Contributions

| Rule | Standard | Code | Status |
|---|---|---|---|
| SSS | 15% of the monthly salary credit (MSC): employee 5%, employer 10%. Employees' Compensation (EC) ₱10 below a ₱15,000 MSC, ₱30 from it. MSC ₱5,000–₱35,000. | `src/domains/payroll/templates/ph-statutory-2025.ts` (`sssRows`) | Code ✓. Verify: the 2026 table on sss.gov.ph. Secondary 2026 sources agree with the 15% split. |
| PhilHealth | 5% of basic monthly salary, split 2.5% / 2.5%. Income floor ₱10,000, ceiling ₱100,000. | same file, `PHIC` | Code ✓. Verify: philhealth.gov.ph. Secondary 2026 sources agree. |
| Pag-IBIG (HDMF) | Employee 1% if fund salary ≤ ₱1,500, else 2%. Employer 2%. Fund salary capped at ₱10,000, so the maximum is ₱200 each. | same file, `HDMF` | Code ✓. Verify: pagibigfund.gov.ph. Secondary 2026 sources agree; one site still shows the old ₱5,000 cap. |
| Base for contributions | Monthly basic pay; daily-rated staff use their monthly equivalent. | `engine/compute-pay.ts` | Code ✓. |
| Deductible before tax | Employee contributions reduce taxable income before withholding. | `engine/compute-pay.ts` (`taxableIncome`) | Code ✓. |

## 3. Withholding tax on compensation

| Rule | Standard | Code | Status |
|---|---|---|---|
| Annual brackets (TRAIN) | 0% to ₱250,000; 15% over ₱250,000; ₱22,500 + 20% over ₱400,000; ₱102,500 + 25% over ₱800,000; ₱402,500 + 30% over ₱2,000,000; ₱2,202,500 + 35% over ₱8,000,000. | `templates/ph-statutory-2025.ts` (`taxTables`), `payroll-tax.ts` | **Fixed 2026-11-14.** The seed had bases and thresholds rounded to whole pesos, off by up to ₱0.13 per period. Now exact to the centavo, for weekly ÷52, semi-monthly ÷24, monthly ÷12. |
| Per-period withholding | BIR requires withholding per pay period; the annual schedule is divided by the number of periods. | `compute-pay.ts` | Code ✓ as an approximation. It doesn't annualize each employee's pay the way RR 11-2018 describes for variable pay. |
| Minimum-wage earners | Exempt from income tax. | `compute-pay.ts` (`minimumWageEarner`) | Code ✓. HR sets the flag. Verify the regional wage order at each change. |
| 13th-month and other benefits exemption | Exempt up to ₱90,000 a year combined, across 13th-month pay and other benefits such as bonuses. Excess is taxable. | `adjustment-categories.ts` marks `thirteenth_month` as non-taxable | **Gap.** The code doesn't track the ₱90,000 total. HR must mark the excess as taxable by hand. The category comment says so. |
| Year-end reconciliation and Form 2316 | Employer reconciles withholding at year-end and issues the certificate. | — | **Gap.** Nothing in `src/` produces an annual reconciliation or Form 2316. |

## 4. Labor standards (premium pay, 13th month, pay dates, final pay)

| Rule | Standard | Code | Status |
|---|---|---|---|
| Overtime | 125% of hourly rate on an ordinary day (Art. 87). | `premiums.ts` default `overtimeMultiplier` 1.25 | **HR entry.** The engine doesn't compute overtime. The multiplier is shown to HR in the adjustment form. |
| Rest-day work | 130% for the first 8 hours (Art. 91, 93). Overtime on a rest day adds 30% of the hourly rate on top. | `restDayMultiplier` 1.3 | **HR entry.** The 130% is only a warning message. Overtime on a rest day is not combined automatically. |
| Regular holiday worked | 200% of the daily rate (Art. 94). | none | **Gap.** No holiday multiplier in the policy. The holiday calendar (`src/domains/holidays`) is not linked to pay. |
| Special non-working day worked | 130% of the daily rate. | none | **Gap.** As above. |
| Night differential | 10% of the hourly rate for work from 10 p.m. to 6 a.m. (Art. 86). | adjustment category `night_differential`, no calculation | **HR entry.** No automatic calculation. |
| 13th-month pay | One-twelfth of the basic salary earned in the calendar year (PD 851). Overtime, premiums and allowances are excluded. Due by December 24. | `thirteenthMonthDivisor` 12 in the policy. Used by final settlement only. | **Gap.** The regular 13th-month pay isn't computed in the payroll run, and the December 24 due date isn't enforced. Also, one secondary source includes overtime in the base; the PD 851 basis excludes it. Check the base in the code. |
| Pay frequency | Wages paid at least twice a month, at intervals not exceeding 16 days (Art. 103). | New policies and schedules are **monthly only** (decided 2026-11-14). `pay-frequency.ts` still accepts weekly and semi-monthly for existing calendars. Bi-weekly is not supported yet. | **Risk, accepted for now.** Monthly pay conflicts with Art. 103 unless an exemption applies. The exemption criteria are not checked here. Confirm before go-live. |
| Rate in effect on a pay date | Pay follows the rate in effect on each day worked. A change mid-period must be prorated. | `payroll-run-compute.ts` blends the terms in force across the period, weighted by each employee's scheduled workdays (`engine/rate-segments.ts`). A period with no change pays as before. | **Implemented 2026-11-14 (workday basis, decided by the owner).** The blend is by monthly equivalent, so a rate-type change mid-period also blends. The run warns (`pay_terms_changed`) on the record. Contributions use the blended base, which is an approximation. |
| Final pay | Due within a deadline after separation. Commonly cited as 30 days; not verified in this pass. | `Organization.compliance.finalPayDays`, used by `src/domains/dashboard/compliance-risks.ts` to flag overdue settlements | **Verify.** The number is per organization. Check the DOLE guidance and set the value deliberately. |
| Service incentive leave | Five days a year of paid leave, after one year of service (Art. 95). | not found as a payroll or leave rule | **Gap, unverified.** Check whether it is configured as a leave type. Not checked in this pass. |

## 5. Decisions and changes

**Changed 2026-11-14:**
- Withholding brackets corrected to exact values (`templates/ph-statutory-2025.ts`). Test updated
  in `tests/domains/payroll/ph-statutory-template.test.ts`. The old test expected ₱0 withholding at
  ₱10,417 per semi-monthly period, which is ₱0.05 over the exempt line. The test now asserts ₱0.05.
- Template header now records what was checked and what wasn't.

**Decided and implemented, pay-rate change within a period:** the owner chose scheduled workdays as the
unit, since each employee has their own schedule. The period is paid at the blend of the terms in force,
weighted by workdays (see the table in §4). Tests: `tests/domains/payroll/rate-segments.test.ts` and a
run-level case in `payroll-run-service.test.ts`.

**Decided, pay frequency:** monthly only for new policies and schedules, for now. Semi-monthly and
bi-weekly are planned; bi-weekly needs an engine change. Art. 103 is still open (see §4).

**Not changed in this pass (needs the agreed method or external data):**
- 13th-month computation in the payroll run, with the December 24 check.
- ₱90,000 exemption tracking across the year.
- Year-end withholding reconciliation and Form 2316.
- Holiday, rest-day and night-differential calculation.
- Final-pay deadline value and service incentive leave.

## 6. What to verify before relying on the figures

1. SSS table for 2026: sss.gov.ph (circulars for the current MSC table).
2. PhilHealth 2026 premium: philhealth.gov.ph (the rate, floor and ceiling).
3. Pag-IBIG fund-salary cap and rates for 2026: pagibigfund.gov.ph.
4. Withholding tax tables and the ₱90,000 exemption: bir.gov.ph (RR 11-2018 and any later issuance).
5. Labor Code Articles 86, 87, 91, 93, 94, 95 and 103, and PD 851: the official text or DOLE.
6. Regional minimum wage orders for any minimum-wage earner flag.

**Sources consulted (secondary, 2026-11-14):** SSS and PhilHealth and Pag-IBIG contribution guides
from calculator and payroll-vendor sites; BIR withholding guides; Labor Code summaries from
laborlaw.ph and similar sites. None of these is an official issuance.
