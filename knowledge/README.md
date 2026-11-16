# Codebase knowledge base: PCAS HRIS

**Built from commit:** `6587050` (main, 2026-11-09). **Built:** 2026-11-14. **Reorganized:** 2026-11-15.
**Start here:** [overview.md](./overview.md). Then read the file for the area your task touches.

If the repo has moved past `6587050`, the "Last verified" lines in each file are the only record of
what was checked. Re-verify before relying on a claim in an older file.

## Layout

```
knowledge/
  README.md                      this index
  overview.md                    stack, commands, layout, CI gates. Read first.
  CHANGE_PROTOCOL.md             the checklist every change follows
  known-gaps-and-mismatches.md   doc-vs-code conflicts and open decisions
  reference/                     cross-domain reference files
  domains/                       one file per domain (some cover two related areas)
  plans/                         feature plans and designs (one file per feature)
docs/
  architecture/ARCHITECTURE.md   what is built, per phase, with ADR links
  architecture/adr/              decision records
  engineering/ENGINEERING.md     the binding engineering rules (§ numbers are cited everywhere)
```

## Files

| File | Read it when |
|---|---|
| [overview.md](./overview.md) | First. Stack, commands, layout, CI gates. |
| [CHANGE_PROTOCOL.md](./CHANGE_PROTOCOL.md) | Before planning any change. Brief, baseline, slices, tests, review, delivery. |
| [known-gaps-and-mismatches.md](./known-gaps-and-mismatches.md) | Before deciding a behavior is intended. Doc-vs-code conflicts and open decisions. |
| [reference/layers.md](./reference/layers.md) | Adding a route, service or client component. Request flow and layer rules. |
| [reference/cross-cutting.md](./reference/cross-cutting.md) | Errors, dates and timezones, money, audit, storage, cron, security headers, PWA. |
| [reference/data-model.md](./reference/data-model.md) | Touching a Mongoose model, index, or relation. 63 models. |
| [reference/authorization.md](./reference/authorization.md) | Sign-in, session, permissions, roles, Super Administrator, protecting a route. Includes the role and assignment services (formerly `domains/authorization.md`). |
| [reference/ui-patterns.md](./reference/ui-patterns.md) | Building a screen or dialog. Shared components and conventions. |
| [reference/testing.md](./reference/testing.md) | Writing or running tests. Test map and missing coverage. |
| [reference/philippine-payroll-compliance.md](./reference/philippine-payroll-compliance.md) | Any payroll, tax, contribution, 13th-month or pay-date change. What the law requires, what the code does, what is missing. |
| [domains/](./domains/) | One file per domain. Start with the one your task is in. |
| [plans/](./plans/) | Existing plans and designs for features and enhancements. |
| [../docs/architecture/ARCHITECTURE.md](../docs/architecture/ARCHITECTURE.md) | What is built and why, per phase. |
| [../docs/engineering/ENGINEERING.md](../docs/engineering/ENGINEERING.md) | The binding engineering rules. Wins over everything else on conflict. |

### Domain files

| Domain | File | Notes |
|---|---|---|
| Assets | [domains/assets.md](./domains/assets.md) | |
| Attendance | [domains/attendance.md](./domains/attendance.md) | Date handling: see known-gaps B3 |
| Audit | [domains/audit.md](./domains/audit.md) | `src/domains/audit/` is empty; behavior is in `src/server/audit/` |
| Authorization | [reference/authorization.md](./reference/authorization.md) | Lives in `reference/` (one merged file) |
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
| Payroll | [domains/payroll.md](./domains/payroll.md) | Part 1 runs, compensation, schedules. Part 2 calculation engine, rule versions, tax, money. |
| People | [domains/people.md](./domains/people.md) | Person fields, educational background, government IDs, PRC licenses, expiry alerts |
| Performance | [domains/performance.md](./domains/performance.md) | |
| Recruitment | [domains/recruitment.md](./domains/recruitment.md) | |
| Travel orders | [domains/travel-orders.md](./domains/travel-orders.md) | |
| Visibility | [domains/visibility.md](./domains/visibility.md) | |
| Workforce | [domains/workforce.md](./domains/workforce.md) | Part 1 employee lifecycle. Part 2 roster, export, headcount, org chart. |

### Plans

| Plan | File | Notes |
|---|---|---|
| Attendance engine enhancement | [plans/attendance-engine-enhancement.md](./plans/attendance-engine-enhancement.md) | Built. ADR-056, ADR-057 |
| Payroll enhancement | [plans/payroll-enhancement.md](./plans/payroll-enhancement.md) | Phases 1-8, plus Appendices A-C: the Phase 3 (13th month), Phase 4 (year-end tax) and Phase 5 (final settlement) designs |
| Complaints module | [plans/complaints-module.md](./plans/complaints-module.md) | Design, module plan, stage-details plan. ADR-054 |
| Edit ending and Reinstate | [plans/edit-ending-and-reinstate.md](./plans/edit-ending-and-reinstate.md) | Design and plan. ADR-055 |
| Educational background | [plans/educational-background.md](./plans/educational-background.md) | Design and plan |
| Employee IDs and licenses | [plans/employee-ids-and-licenses.md](./plans/employee-ids-and-licenses.md) | Built 2026-11-16. Removes employee RDO/ZIP; adds PWD and Solo Parent IDs, PRC licenses, catalog-backed government IDs, expiry alerts. Design and plan. Known-gaps B29 |
| Leave calendar | [plans/leave-calendar.md](./plans/leave-calendar.md) | Design only |
| Self-service attendance upgrade | [plans/self-service-attendance-upgrade.md](./plans/self-service-attendance-upgrade.md) | PLAN ONLY, not approved, nothing built (2026-11-16); all six projects planned to task level. Six projects to replace biometric terminals with software: punch review, reference photo, correction requests, site code, switch device, offline punches |

## How this knowledge base is built and kept current

It was built in nine phases on 2026-11-14 (orientation, layers, domain inventory, data model,
authorization, UI, cross-cutting, testing, synthesis). The full procedure is in git history (the
former `CODEBASE_EXPLORATION_PLAN.md`, removed 2026-11-15). Ground rules that still apply:

- **Existing sources of truth come first.** Do not re-derive what is written down in the repo
  `README.md`, `docs/architecture/ARCHITECTURE.md`, `docs/engineering/ENGINEERING.md` and
  `docs/architecture/adr/`. ADR numbering has gaps (008, 021, 034, 051 are absent); a gap is not
  necessarily a missing file.
- **Code wins over docs.** Record a doc-vs-code disagreement as a finding in
  `known-gaps-and-mismatches.md` instead of silently picking a side.
- **Read, don't guess.** Every claim cites a file path (and a symbol or line where useful).
- **Never copy secrets.** `.env.local` exists in the working tree; never record its values.
- **Keep each file readable** (roughly 300 lines). Split a domain if it grows past that, and add the
  new file to this index. Where two files cover one area, merge them (as done for payroll,
  workforce and authorization).
- **Update in the same change.** Any change updates the affected files here and their
  "Last verified" lines. Record the commit a file was verified at.
- **Rebuild a phase** when the code changes materially under it.

Domain file template (`domains/<domain>.md`):

```markdown
# <Domain name>

**Purpose:** one sentence.
**Governing docs:** ADR-0xx, ARCHITECTURE.md § <section>, ENGINEERING.md § <n>.
**Services:** `path`: exported functions it provides.
**Models:** names and file paths.
**Routes:** `src/app/api/...` list.
**Pages:** `src/app/(app)/...` list.
**Tests:** file list, or "none".
**Rules a change must respect:** bullets, each with a file citation.
**Known gaps / mismatches:** bullets or "none found".
**Last verified:** <git short hash>.
```

A domain that covers two areas uses `## Part 1` and `## Part 2` headings, each with its own
Services, Models, Routes, Pages, Tests, Rules and Known gaps (see `domains/payroll.md`).

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
spot-check the plan asked for, so the domain files are less verified than the cross-cutting ones.
Items marked "Reported" in the gaps file have not been re-checked.

## Known issues with this knowledge base

- **`CHANGE_PROTOCOL.md`** was not written by this exploration. Its author and whether to keep it
  are open questions (known-gaps C11).
- Several domain files and the gaps report cite line numbers. Line numbers drift when code changes.
  Re-check before editing.
