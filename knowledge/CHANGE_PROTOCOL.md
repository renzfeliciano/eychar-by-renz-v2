# Change Protocol

How to extend, add to, or enhance PCAS HRIS without breaking what already works. Every change follows
this protocol. It is a checklist over the binding rules in [docs/ENGINEERING.md](../docs/ENGINEERING.md),
which win on any conflict. The exploration output in this folder is the map; read the relevant domain
file before planning.

Prerequisites: the codebase exploration plan ([CODEBASE_EXPLORATION_PLAN.md](./CODEBASE_EXPLORATION_PLAN.md))
is finished, including the synthesis and gap report (Phase 8).

## 0. Ground rules (always)

- **Model the business, don't hardcode it.** No company, project, position, role, permission, payroll
  formula, leave type or policy value in code. Configuration is data (ENGINEERING §2, §55).
- **Preserve existing behavior** unless the task explicitly requires a change (§52). Don't rewrite
  working code, auth, or UI for taste.
- **Code wins over docs.** If ARCHITECTURE.md, an ADR and the code disagree, record the mismatch in the
  gap report and ask before choosing a side.
- **Read before writing.** Every claim in your plan cites a file path. No citation, no assumption.
- **Never copy secrets** from `.env.local`.

## 1. Brief (before any file is edited)

Write a feature brief (a section in the feature's plan doc or a PR description). It must contain:

1. **Goal:** one or two sentences, what changes for the user.
2. **Domain owner:** the `src/domains/<domain>` folder(s) that own the change (ENGINEERING §29).
3. **Governing ADRs:** the existing decisions this touches. A new decision needs a new ADR.
4. **Impact list:**
   - models (`src/server/db/models/`)
   - domain services
   - route handlers (`src/app/api/...`)
   - pages and components (`src/app/(app)/...`, `src/components/`)
   - permissions and scope
   - audit events
   - existing tests (`tests/...`)
5. **Compatibility:** what existing behavior, data, or API responses must stay the same.
6. **Historical impact:** do past transactions (payroll runs, attendance records, leave) change? If so,
   how are they protected?
7. **Open questions:** anything you can't settle from the code. Ask these before coding.

Then present the plan and wait for approval if it changes data shape, permissions, or payroll results.
Small, additive changes can proceed.

## 2. Baseline (before any edit)

```
npm run typecheck
npm run lint
npm test            # test:ui, test:domains, test:core
```

Record any failures in the brief as pre-existing. You are not responsible for them, but you must not
add new ones. Run the e2e suite (`npm run test:e2e`) for any change touching a user flow.

## 3. Implement in small, additive slices

- **Add, don't replace.** New optional fields, new routes, new functions. Changing a required field,
  a response shape, or an existing function signature needs the impact list to cover every caller.
- **Keep layers separate** (ENGINEERING §37, §55):
  - Route handler: authenticate → validate → resolve context → authorize → call domain service → audit → return.
  - Domain service: business logic and rules, transactions where justified.
  - Model: schema and indexes only.
  - Client component: presentation, no business logic, no authorization as security.
- **Scope from the server.** Never trust a `projectId` or `organizationId` sent from the browser (§55).
- **Effective dating.** Anything that changes over time (assignments, compensation, policies, payroll
  rules) takes effect from a date. Historical records must use the rules in force on their date (§27).
- **Database changes** (§53): no destructive migrations or collection renames without explicit approval.
  New required fields need a backfill script that is idempotent. Seed data stays normal records.
- **Match an existing pattern** in a sibling domain before inventing a new one. No god services, no
  `utils/` dumping ground.

## 4. Test at the level you changed

| You changed | Test here | Reference |
|---|---|---|
| Domain logic | `tests/domains/<domain>/` | ENGINEERING §58 |
| Historical behavior | Historical scenario test | §59 |
| Permissions or scope | Server-side authorization test (never UI-only) | §60 |
| Route handlers | `tests/server/` or `tests/app/` | |
| Security | `tests/security/` | §42 |
| Full user flow | Playwright in `tests/e2e/` | |

Write the test before the fix for bugs. New behavior needs at least one test that would fail without it.

## 5. Validate

```
npm run typecheck
npm run lint
npm test
npm run build
```

Then run the app (`run` skill) and walk the changed feature plus the adjacent features it could break:
the same domain's list page, the person's detail page, and anything that reads the same data.

## 6. Review (before the PR)

Check each item against the diff:

- [ ] Authorization is enforced on the server, with the correct scope.
- [ ] Organization data is isolated (no cross-tenant reads or writes).
- [ ] Historical records are unchanged, and past calculations still reproduce.
- [ ] Errors are handled and return the standard error shape (§48).
- [ ] Audit entries are written for every state change (§35).
- [ ] No business logic in route handlers or components.
- [ ] No hardcoded business values.
- [ ] Mobile layout still works (§41).
- [ ] Types are explicit; no `any` added (§47).
- [ ] Only the impact list was touched. Unrelated edits are removed.

## 7. Deliver

- Commit on a branch, not `main`. One logical change per commit.
- Open a PR. Its description includes the brief, the baseline results, and the validation results.
- CI runs on push and PR (`.github/workflows/ci.yml`). Wait for it to pass.
- For significant architecture, update [ARCHITECTURE.md](../ARCHITECTURE.md) and add or update an ADR
  in `docs/architecture/adr/` (§61).
- Update the affected domain file in `knowledge/` so the next change starts from accurate facts.

---

## Worked example: Attendance and payroll upgrade with a payroll engine

This is the first planned change. Start it only after the exploration is finished.

**What already exists (verify in the knowledge base before planning):**

- Attendance: `src/domains/attendance/` (records, policies, schedules, shifts, geofence, self-service clock, reports).
- Payroll: `src/domains/payroll/` with an `engine/` folder (`compute-pay.ts`, `contributions.ts`,
  `premiums.ts`, `pay-periods.ts`, `pay-frequency.ts`, `money.ts`), `payroll-run-compute.ts`,
  `payroll-attendance.ts`, `payroll-tax.ts`, and a Philippine statutory template in `templates/`.
- Tests: `tests/domains/attendance/` and `tests/domains/payroll/` (including `payroll-engine.test.ts`).

Because an engine already exists, the first step is to **extend it, not rewrite it** (§52). The
exploration must answer:

1. What does `compute-pay.ts` do today, and what inputs does it take? Which of those inputs come from
   attendance, and through which function (`payroll-attendance.ts`)?
2. Where are payroll rules versioned (`PayrollRuleVersion`), and are they effective-dated?
3. Which calculations are hardcoded in code rather than read from policy or rule data? These are the
   first things to move into configuration. List them in the gap report.
4. Which existing payroll runs and attendance records must still reproduce exactly after the change?
   Those become regression tests before any code is edited.
5. What is the approval and audit path for a payroll run, and can a finished run be recalculated?

**Design constraints for this change:**

- Payroll formulas and rule parameters are data (`PayrollPolicy`, `PayrollRule`, `PayrollRuleVersion`),
  not code (§28). Country-specific rules stay in a template or rule implementation, not in the core engine.
- Each payroll result records its policy version, the rules used, its inputs, its results, its
  adjustments and its approvals, so it can be reproduced (§28).
- Attendance inputs used by payroll are snapshotted into the payroll record when the run is computed.
  Later attendance corrections must not silently change a finished payroll.
- Use the historical test (§59): an employee's past payroll is computed with the rules in force on
  that date, even after the rules change.
- Authorization test (§60): HR scoped to the organization can run payroll; a project-scoped manager
  cannot see or run payroll outside their project.

**Questions to answer with the user before planning:**

- Which attendance-driven pay items are in scope now: overtime, late and undertime deductions, night
  differential, holiday pay, absences? Which can wait?
- Should the engine support countries beyond the Philippines in this change, or only make it
  possible later?
- Must finished payroll runs be recomputable with the new engine, or only new runs use it?
</content>
