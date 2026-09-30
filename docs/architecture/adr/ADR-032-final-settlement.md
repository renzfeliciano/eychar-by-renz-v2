# ADR-032: Final Settlement (separation pay-out)

## Status

Proposed (2026-09-30). Design only; not yet implemented. Companion to ADR-031 (Workforce Clearance).

## Context

At separation the company owes the employee several amounts at once:
- salary for the last partial period;
- unused leave that converts to cash;
- the pro-rated 13th month;
- reimbursements still due;
- bonuses or incentives already earned;
- depending on why they left, separation or retirement pay.

Against that it deducts:
- whatever clearance found they still owe (ADR-031);
- outstanding loans and advances;
- statutory contributions;
- the year-end tax true-up.

Done by hand, this is where the costly mistakes happen: a leave balance read from an old report, a
13th month computed on the wrong base, tax that ignores the rest of the year's withholding, a
deduction nobody can justify. It's also where payments run late, when the approval is an email
thread.

The payroll engine (ADR-029) already computes a period's pay, allowances, adjustments, statutory
contributions and withholding tax as pure, tested functions, with government tables kept as
versioned data (rule versions). Final Settlement reuses all of that and adds only what is specific
to separation.

## How it relates to Clearance

```
Workforce › Clearance (ADR-031)          Workforce › Final Settlement (this ADR)
─────────────────────────────            ────────────────────────────────────────
Separation case opened          ───────► Settlement draft created (same case)
Items cleared / flagged / waived ──────► Flagged amounts become proposed deductions
All blocking items resolved     ───────► Settlement can be submitted for approval
                                         Approved → disbursed → documents issued
Case closed                     ◄─────── Settlement released (closes the case)
```

- **One case, two views.** Clearance owns the checklist; Final Settlement owns the money.
- **Early drafts are allowed.** Finance can draft and preview a settlement while clearance is
  still running.
- **Approval waits for clearance.** Submitting for approval is blocked until clearance has no open
  blocking items. This is the key control: nothing is paid out while accountabilities are
  unresolved.

## Decision

Add **Workforce › Final Settlement** (`/final-settlements`). Each settlement is a versioned
computation for one separated employee, built from system-of-record data and approved in stages.
It is disbursed as a one-employee payroll run of type `final`, reusing the existing run states,
payslip and register export.

### Components of the settlement

Every line records its **source** (the record it came from) and its **basis** (the rule and inputs
used), so anyone reviewing it can trace every peso.

| Group | Line | Source | Computation (as rule-version data, not code) |
| --- | --- | --- | --- |
| Earnings | Salary balance | Attendance + compensation (ADR-029) | Engine proration for days worked in the last partial period |
| Earnings | Unpaid prior periods | Payroll runs | Any period between the last released run and separation |
| Earnings | Leave encashment | `LeaveBalance`, leave policy | Convertible days × daily rate; which types convert, and caps, come from the leave policy |
| Earnings | Pro-rated 13th month | Released payroll records this year + salary balance | Basic salary earned in the calendar year ÷ 12, less 13th month already paid |
| Earnings | Bonuses / incentives | HR entry, with a document | Only earned, approved amounts; each needs a reason and an attachment |
| Earnings | Reimbursements | Approved claims, liquidated travel orders | Amounts owed back to the employee |
| Earnings | Separation / retirement pay | Separation type, tenure, rule version | By separation type and years of service, per the rule version (see Compliance) |
| Deductions | Accountabilities | Clearance items flagged with amounts | Linked to the clearance item; can't exist without one |
| Deductions | Loans and advances | Payroll adjustments, cash advances | Remaining balance |
| Deductions | Statutory contributions | Engine contribution rules | For the final period, same as a regular run |
| Deductions | Withholding tax true-up | Year-to-date payroll records | Annualized tax on year-to-date taxable income, less tax already withheld (can be a refund) |

**Net pay** is earnings minus deductions. If deductions exceed earnings, the settlement shows a
**balance due from the employee**. It is not silently floored at zero, so Finance can collect it
or waive it formally.

### Lifecycle and approvals

```
Draft → Computed → HR reviewed → Finance approved → Disbursed → Closed
            ▲            │               │
            └──── Returned for correction ┘
```

- **Draft / Computed:** Finance (payroll) runs the computation. Re-running creates a **new
  version**; earlier versions are kept for comparison.
- **HR reviewed:** HR confirms the separation facts: type, last day, leave, bonuses.
- **Finance approved:** a *different* Finance user approves, with maker-checker enforced as in
  payroll runs. Amounts above an organization threshold need a second approver.
- **Disbursed:** release creates the `final` payroll run, and the payslip and register export
  follow the normal payroll path. The bank or payment reference is recorded.
- **Closed:** the documents are issued:
  - final payslip and settlement statement;
  - certificate of employment;
  - BIR Form 2316;
  - quitclaim, if used.

  The Clearance case then closes.

Every transition requires the permission for that step, records who acted and when, and writes an
`AuditLog` event. Returns for correction carry a mandatory reason.

### Governance and risk controls

- **Permissions:**

  | Permission | Allows |
  | --- | --- |
  | `final-settlements.read` | View settlements |
  | `final-settlements.prepare` | Compute a settlement (payroll) |
  | `final-settlements.review` | Confirm the separation facts (HR) |
  | `final-settlements.approve` | Approve the settlement (Finance) |
  | `final-settlements.disburse` | Record the payment and release it |

  These are literal keys in `rbac.ts`.
- **Segregation of duties:**
  - the preparer can't review or approve;
  - no one can act on their own settlement.
- **Locked inputs:** at approval, the settlement snapshots every input it used: leave balance,
  rates, rule version and year-to-date totals. Later changes to those records never change an
  approved settlement. They show as a "sources changed since approval" warning, and an update
  needs a new version.
- **No free-form deductions:** every deduction must link to a clearance item, an adjustment or a
  loan record.
- **Manual lines need justification:** added earnings or deductions require a reason and an
  attachment, and are highlighted in review.
- **Variance checks** (warnings, some blocking):
  - net pay negative;
  - leave encashed above the policy cap;
  - 13th month already paid in full;
  - tax true-up above a set percentage of gross;
  - salary rate changed within the last 30 days;
  - missing government IDs (reusing the profile checks).
- **Tamper evidence:** each approved version stores a hash of its lines and inputs. The statement
  and the audit entry show it.

### Compliance (Philippines baseline, as data)

All rates, caps and deadlines live in **rule versions** (ADR-029), not code, so they can be
updated when regulations change and past settlements keep the rules they were computed with.

| Rule | Rule-version default |
| --- | --- |
| Final pay deadline | Within 30 days of separation (DOLE Labor Advisory No. 06-2020); shown as a countdown |
| Certificate of employment | Issued within 3 days of the request (same advisory) |
| 13th month | Pro-rated: basic salary earned in the calendar year ÷ 12 (PD 851) |
| Service incentive leave | Unused days converted to cash (Labor Code Art. 95); company leave policies may add more |
| Separation pay | By authorized cause and tenure (Labor Code Arts. 298–299) |
| Retirement pay | RA 7641 minimum where no company plan applies |
| Tax-exempt 13th month and other benefits | The statutory cap, from the tax rule version |
| Final tax and BIR Form 2316 | Year-end annualization at separation |

The payroll lead or counsel should confirm these defaults before go-live. The design keeps them as
data precisely so that confirmation is a configuration step, not a code change.

### Employee experience

In **Self-service › My final pay**, the leaving employee sees:
- the status (being computed, under review, approved, paid);
- the expected payment date and the deadline;
- a plain-language breakdown of each line once it's approved;
- their documents to download (payslip, statement, COE, BIR 2316).

They can raise a question on any line. That creates an HR case linked to the settlement, instead
of an email.

### Screens

- **Final Settlement list:**
  - a metric strip: in progress, awaiting approval, due in 7 days, overdue, total payable this
    month;
  - status tabs;
  - one row per settlement, with net amount, deadline countdown and the current approver.
- **Settlement page:**
  - a header with the employee, separation type, last day, deadline and clearance status;
  - earnings and deductions tables, each line with its source link and basis tooltip;
  - variance warnings;
  - version history with a diff;
  - approval timeline;
  - documents.
- **Comparison view:** version N versus N-1, line by line, for reviewers.
- **Reports:**
  - settlements by month;
  - share paid on time;
  - average days to pay;
  - deduction categories;
  - waived balances.

  Exportable to Excel and CSV like the payroll register.

### Scalability and reliability

- **Pure computation:** the same engine functions as payroll, with the calculator unit-tested
  against fixtures, including the government tables.
- **Idempotent release:** disbursing twice can't create two payroll runs (unique per settlement
  version).
- **Queued documents:** generation runs in the background job, so a large separation batch (end of
  a project, redundancy) doesn't time out.
- **Batch mode for mass separations:** open settlements for many employees at once, compute them
  in the background, and review them in one list.
- **Indexing:** by organization, status and deadline, which keeps list and deadline queries fast.

## Consequences

- **Positive:**
  - one traceable record per exit;
  - fewer calculation errors, since there's no re-keying and rules are data;
  - on-time payment, with deadlines, escalation and visible approvers;
  - defensible in audits and labor disputes;
  - a clearer, more respectful exit for the employee.
- **Costs:**
  - new models: `FinalSettlement` (versions and lines), plus approvals and documents;
  - the `final` payroll run type;
  - year-to-date aggregation and a tax annualization function in the engine;
  - leave-policy conversion settings;
  - new permissions (seed, then a dev-server restart).
- **Dependencies:**
  - Clearance (ADR-031) for accountabilities;
  - leave policies must define conversion;
  - bonuses and reimbursements need an approved source record to be automatic, and are manual
    lines with attachments until then.

## Delivery plan

These phases fit after ADR-031's foundation phase.

1. **Settlement core:**
   - model and lifecycle;
   - salary balance through the engine;
   - accountabilities from clearance;
   - maker-checker;
   - audit.
2. **Separation earnings:** leave encashment, pro-rated 13th month, separation and retirement pay
   from rule versions.
3. **Tax and statutory:** year-to-date aggregation, annualized tax true-up, BIR 2316 data.
4. **Disbursement and documents:** `final` payroll run, payslip, statement, COE, self-service view.
5. **Controls and reporting:** variance checks, version comparison, hash, reports, batch mode.

Each phase is test-first (TDD) and usable on its own.

## Open questions

- Which leave types convert to cash, and at what rate or cap? (Shared with ADR-031.)
- Does the company have a retirement plan that overrides the RA 7641 minimum?
- The approval threshold for a second Finance approver.
- Payment channel: bank transfer file, check or cash, and whether we generate a bank file.
- Should a small balance due from the employee be auto-waived below a threshold?
