# ADR-031: Workforce Clearance (offboarding approval workflow)

## Status

Proposed (2026-09-30). Design only; not yet implemented. Companion: ADR-032 (Final Settlement).

## Context

When someone leaves, the company has to get back what it issued (laptop, ID, tools, cash
advances), close their access, settle what each side owes, and pay the final pay on time. Today
that runs on paper forms and chat messages between HR, Finance, IT and Admin. Nobody can see
which department is holding things up. Final pay slips past its deadline. When an auditor or a
labor complaint asks "who cleared this, and when?", there's no reliable answer.

Most of the facts clearance needs already live in this app:

| Existing data | What clearance learns from it |
| --- | --- |
| `AssetIssuance` (issued, returned, condition) | What must come back, and what's damaged or lost |
| `LeaveBalance` | Unused leave that may convert to cash in the final pay |
| `PayrollRun` / engine proration (ADR-029) | Final pay for the last partial period |
| `PayrollAdjustment` | Accountabilities as deductions, conversions as earnings |
| `TravelOrder` | Advances not yet liquidated |
| `Case` | Open disciplinary or legal matters that should hold a release |
| `Employment` (`effectiveTo`, `terminationReason`) | Last working day and separation type |
| `User` / self-service account (ADR-020, ADR-030) | Access that must end on the last day |
| `AuditLog`, RBAC (`rbac.ts`) | Who did what, and who's allowed to |

So clearance should be a **workflow on top of these records**, not a separate spreadsheet that
duplicates them.

## Decision

Add **Workforce › Clearance** (`/clearance`): a case-based approval workflow. Each separation opens
one clearance case. Each department clears its own checklist in parallel, and the case moves to
final pay and release only when every blocking item is cleared or formally waived.

### Goals

- **Governance:** one owner per item, segregation of duties, an immutable trail, template versions.
- **Risk:** no final pay released while blocking accountabilities are open; access ended on time;
  deductions only with a documented basis.
- **Efficiency:** items generated and auto-cleared from live data; department inboxes instead of
  chasing; deadlines with escalation.
- **Employee experience:** the leaver sees progress, what's still needed from them, and when to
  expect final pay, in the self-service portal.

### Non-goals (for this ADR)

- Email or SMS delivery. In-app notifications first; channels plug in later.
- E-signature integrations. Sign-off is an authenticated, audited action in the app.
- Rehire eligibility scoring. We only record the separation outcome.

## Lifecycle

```
Draft → Open → In clearance → Final pay → Released → Closed
                    │                                 ▲
                    └──────── Cancelled (withdrawn resignation) ─┘
```

1. **Initiate.** HR opens a case from the employee's profile or the Clearance list. It needs the
   separation type (resignation, end of contract, termination, retirement, death, redundancy), the
   notice date and the last working day. Resignations can also start from a self-service request
   that HR accepts. The case snapshots the organization's current **clearance template**, so later
   template edits never change a case in progress (same principle as schedule snapshots, ADR-027).
2. **Clearance.** Items are grouped by department and cleared in parallel. Some wait on others
   (for example, Finance's "accountabilities computed" waits on Admin and IT returns).
3. **Final pay.** Finance prepares the settlement (below) and a second Finance user approves it
   (the same maker-checker rule as payroll runs).
4. **Release.** Final pay is released, and the documents are issued: certificate of employment,
   clearance certificate, and quitclaim if the company uses one.
5. **Close.** The Employment record gets its end date and separation status, self-service access
   stays disabled, and the case becomes read-only.

## Departments and default checklist

Departments are an organization catalog (Settings › Catalogs) seeded with HR, Finance, IT, Admin
and **Immediate supervisor**. Each template item names its department, the role that may sign it
off, a deadline counted from the last working day, and whether it **blocks** release.

| Department | Item | Auto-source | Blocking |
| --- | --- | --- | --- |
| Supervisor | Turnover of work and files | none | Yes |
| Admin | Return company ID, keys, uniforms, tools | open `AssetIssuance` by type | Yes |
| IT | Return laptop, phone and accessories | open `AssetIssuance` by type | Yes |
| IT | Revoke system and email access | `User.status`, role assignments | Yes |
| Finance | Liquidate cash advances and travel orders | unliquidated `TravelOrder` | Yes |
| Finance | Compute accountabilities (lost or damaged assets, loans) | `AssetIssuance.condition` | Yes |
| HR | Leave balance review and conversion | `LeaveBalance` | No |
| HR | Open cases review | open `Case` | Configurable |
| HR | Exit interview | none | No |

**Auto-sources** keep items honest. An asset item lists the actual unreturned assets and clears
itself when each one is marked returned. It can't be ticked while a laptop is still out. "Revoke
access" clears when the account is disabled. People sign off only what the system can't check.

### Item states

`Pending → In progress → Cleared`, plus:

- **Flagged:** an issue was found, with an amount and a note (for example, "laptop screen damaged,
  ₱8,500"). Finance can turn it into a deduction.
- **Waived:** only by a role above the item owner, with a written reason. Always audited and shown
  on the certificate.
- **Not applicable:** set by the template rules, such as "no company laptop issued".

## Final pay settlement

Final pay is its own submodule, **Workforce › Final Settlement** (ADR-032), attached to the same
case:
- Clearance supplies the accountabilities: each flagged amount becomes a linked, proposed
  deduction.
- Final Settlement computes everything owed and runs its own approval.
- A settlement can be drafted while clearance is still running.
- A settlement can only be submitted for approval once clearance has no open blocking items.
- Releasing the settlement closes the clearance case.

## Governance and controls

- **Permissions:**

  | Permission | Allows |
  | --- | --- |
  | `clearance.read` | View cases |
  | `clearance.create` | Open a case (HR) |
  | `clearance.update` | Edit case details (HR) |
  | `clearance.sign-off` | Sign off items; scoped to the item's department through the user's role |
  | `clearance.waive` | Waive an item (senior HR or department head) |
  | `clearance.release` | Release final pay and documents (Finance approver) |
  | `clearance-templates.manage` | Edit the clearance template |

  These stay literal keys in `rbac.ts`, as agreed (no dynamic permission engine).
- **Segregation of duties:**
  - the person who prepares final pay can't approve it;
  - the initiator can't waive their own case's blocking items;
  - nobody can sign off their own clearance.
- **Immutable trail:** every state change, sign-off, waiver, amount and document is an `AuditLog`
  event. The case timeline is read from it and is never edited.
- **Evidence:** items can require an attachment (return slip, liquidation report), stored like
  `EmployeeDocument`.
- **Template versions:** templates are versioned. A case records the version it used, so "what
  rules applied to this person" is always answerable.
- **Data privacy:** the case keeps what compliance needs. Exit interview notes are restricted to
  HR. Retention follows the organization's records policy.

## Timeliness and escalation

A daily job, on the same cron mechanism as payroll schedules, will:

- mark items overdue past their deadline;
- notify the department inbox, then the department head after N days;
- warn Finance and HR at 7 and 3 days before the final pay deadline;
- re-run auto-sources, catching assets returned elsewhere in the app.

## Screens

- **Workforce › Clearance:**
  - a metric strip: open cases, overdue items, due this week, average days to final pay, share
    paid on time;
  - status tabs;
  - one row per case, with a per-department progress bar and the next deadline.
- **Case page:**
  - a header with the employee, separation type, last day and final pay countdown;
  - department columns, each item with owner, deadline, state and evidence;
  - the final pay settlement panel;
  - the timeline.
- **My clearance tasks:** each department's inbox of items waiting on them across all cases,
  with bulk sign-off for clean auto-cleared items.
- **Employee profile:** a "Clearance" tab while a case exists.
- **Self-service › My clearance:** progress per department, what the leaver still owes (return
  the laptop to IT by the 12th), the expected final pay date, and downloadable certificates.
- **Settings › Clearance template:** departments, items, deadlines, blocking flags and auto-sources.

## Metrics for management

- Time to clear, per department.
- Share of final pay released within the deadline.
- Waivers by department and reason.
- Unrecovered asset value.
- Separations by type and month.

All of these are exportable, in the same Excel and CSV style as attendance.

## Consequences

- **Positive:**
  - one place to see who is holding a clearance;
  - fewer manual checks, because auto-sources do them;
  - defensible records for audits and labor claims;
  - final pay tied to real, justified accountabilities;
  - a clearer, kinder exit for the employee.
- **Costs:**
  - new models: `ClearanceTemplate`, `ClearanceCase`, `ClearanceItem`, `FinalPaySettlement`;
  - a new `final` payroll run type;
  - a Department catalog;
  - a daily job;
  - new permission keys, which need the seed script and a dev-server restart.
- **Dependencies:**
  - assets must be recorded consistently, or asset items can't auto-clear;
  - leave conversion rules must be defined in leave policies.

## Delivery plan

1. **Foundation:** Department catalog, template (Settings), case and item models, lifecycle, RBAC,
   audit, list and case pages.
2. **Auto-sources:** assets, travel orders, cases, account access; department inbox.
3. **Final pay:** settlement, `final` payroll run, maker-checker, payslip; deductions linked to
   items.
4. **Employee and escalation:** self-service view, daily job, notifications, certificates.
5. **Reporting:** metrics, exports.

Each phase ships behind its own tests (TDD) and is usable on its own.

## Open questions

- Should a resignation request start in self-service, or only from HR?
- Which documents are issued at release (COE, clearance certificate, quitclaim), and do they need
  the company's letterhead template?
- Leave conversion: which leave types convert to cash, and at what rate?
- Who is the "department head" for escalation: a role, or a person per organization unit?
