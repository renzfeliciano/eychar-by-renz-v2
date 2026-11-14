# Codebase knowledge base: PCAS HRIS

**Built from commit:** `6587050` (main, 2026-11-09). **Built:** 2026-11-14.
**Start here:** [overview.md](./overview.md). Then read the file for the area your task touches.

If the repo has moved past `6587050`, the "Last verified" lines in each file are the only record of
what was checked. Re-verify before relying on a claim in an older file.

## Files

| File | Read it when |
|---|---|
| [overview.md](./overview.md) | First. Stack, commands, layout, CI gates. |
| [layers.md](./layers.md) | Adding a route, service or client component. Request flow and layer rules. |
| [cross-cutting.md](./cross-cutting.md) | Errors, dates and timezones, money, audit, storage, cron, security headers, PWA. |
| [data-model.md](./data-model.md) | Touching a Mongoose model, index, or relation. 63 models. |
| [authorization.md](./authorization.md) | Permissions, roles, session and sign-in, protecting a route. |
| [ui-patterns.md](./ui-patterns.md) | Building a screen or dialog. Shared components and conventions. |
| [testing.md](./testing.md) | Writing or running tests. Test map and missing coverage. |
| [philippine-payroll-compliance.md](./philippine-payroll-compliance.md) | Any payroll, tax, contribution, 13th-month or pay-date change. What the law requires, what the code does, what is missing. |
| [known-gaps-and-mismatches.md](./known-gaps-and-mismatches.md) | Before deciding a behavior is intended. Doc-vs-code conflicts and open decisions. |
| [domains/](./domains/) | One file per domain. Start with the one your task is in. |
| [CODEBASE_EXPLORATION_PLAN.md](./CODEBASE_EXPLORATION_PLAN.md) | How this knowledge base was built and how to rebuild it. |

### Domain files

| Domain | File | Notes |
|---|---|---|
| Assets | [domains/assets.md](./domains/assets.md) | |
| Attendance | [domains/attendance.md](./domains/attendance.md) | Date handling: see known-gaps B3 |
| Audit | [domains/audit.md](./domains/audit.md) | `src/domains/audit/` is empty; behavior is in `src/server/audit/` |
| Authorization | [domains/authorization.md](./domains/authorization.md) | Full version: [authorization.md](./authorization.md) |
| Cases | [domains/cases.md](./domains/cases.md) | |
| Complaints | [domains/complaints.md](./domains/complaints.md) | Added after the baseline commit; see ADR-054 |
| Catalog | [domains/catalog.md](./domains/catalog.md) | |
| Clearance | [domains/clearance.md](./domains/clearance.md) | |
| Dashboard | [domains/dashboard.md](./domains/dashboard.md) | |
| Deletion | [domains/deletion.md](./domains/deletion.md) | Recycle bin (ADR-033) |
| Documents | [domains/documents.md](./domains/documents.md) | |
| Events | [domains/events.md](./domains/events.md) | |
| Final settlement | [domains/final-settlement.md](./domains/final-settlement.md) | ADR-032 is still Proposed: known-gaps B1 |
| Holidays | [domains/holidays.md](./domains/holidays.md) | |
| Identity | [domains/identity.md](./domains/identity.md) | |
| Leave | [domains/leave.md](./domains/leave.md) | |
| Organization | [domains/organization.md](./domains/organization.md) | |
| Payroll | [domains/payroll.md](./domains/payroll.md) | Engine: [payroll-engine.md](./domains/payroll-engine.md) |
| People | [domains/people.md](./domains/people.md) | |
| Performance | [domains/performance.md](./domains/performance.md) | |
| Recruitment | [domains/recruitment.md](./domains/recruitment.md) | |
| Travel orders | [domains/travel-orders.md](./domains/travel-orders.md) | |
| Visibility | [domains/visibility.md](./domains/visibility.md) | |
| Workforce | [domains/workforce.md](./domains/workforce.md) | Roster and org chart: [workforce-roster-org-chart.md](./domains/workforce-roster-org-chart.md) |

## How this was built

- **Phase 0–1:** read by hand (`overview.md`, `layers.md`).
- **Phase 2:** 23 domain files, written by sub-agents from a shared template, each covering a
  group of domains.
- **Phase 3–7:** data model, authorization, payroll, UI, testing and cross-cutting files, written
  by sub-agents.
- **Phase 8:** this index and `known-gaps-and-mismatches.md`, written by hand after reviewing the
  sub-agent output.

## How well it was checked

Sub-agent reports were not taken on trust. I re-checked these claims against the source:

- Idle timeout default of 60 s and the 30 min / 12 h mismatch with ADR-030 (A1). **Fixed 2026-11-14**: now 30 min / 8 h.
- `GET /api/employees` has no pagination and no audit call (A2)
- Employee documents can be deleted via the recycle bin, against ADR-025 (A4)
- ADR-032 status is "Proposed" (B1)
- Malformed JSON returns 500 (B2)
- Attendance uses the UTC date (B3)
- Audit date filters are server-timezone-dependent (B4)
- Overtime and rest-day multipliers are not applied by the engine (B5)
- Recycle bin is a move to `DeletedRecord`, per ADR-033 (B8)
- Model count is 63, not 65 (B21)
- ADR-034 and ADR-051 are cited in code but missing (C1, partly)
- e2e is not run in CI, despite the test README (C2)
- `src/domains/audit/` is empty (C3)
- `design-system/workforcehub/pages/` is empty (C4)

That is 13 checks across the whole knowledge base. It is **not** the five-claims-per-file
spot-check the plan asks for, so the domain files are less verified than the cross-cutting ones.
Items marked "Reported" in the gaps file have not been re-checked.

## Known issues with this knowledge base

- **`CHANGE_PROTOCOL.md`** is in this folder but was not written by this exploration. It is
  untracked. It refers to Phase 8 as a prerequisite, so it may be a companion written by someone
  else. Its author and whether to keep it are open questions (known-gaps C11).
- **`knowledge/` is untracked** in git. Nothing here is committed yet.
- Several domain files and the gaps report cite line numbers. Line numbers drift when code changes.
  Re-check before editing.
