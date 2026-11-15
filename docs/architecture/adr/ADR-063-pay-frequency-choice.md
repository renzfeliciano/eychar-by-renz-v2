# ADR-063: Pay frequency is HR's choice; monthly needs an acknowledgement

**Status:** Accepted, 2026-11-15 (payroll plan Phase 6; owner answers 2026-11-15). Replaces the 2026-11-14 "monthly only" decision.
**Context:** New policies and schedules were limited to monthly pay. The Labor Code (Art. 103, as the sources read it) requires pay at least twice a month, no more than 16 days apart, so monthly pay is a legal risk for rank-and-file staff. Some employers also pay every two weeks, which the engine didn't support.

## Decision

1. **HR picks weekly, bi-weekly, semi-monthly or monthly** for each payroll policy and schedule. New ones default to semi-monthly.
2. **Monthly is never blocked, but needs a tick.** Choosing it shows the Art. 103 warning; saving needs the acknowledgement, enforced in validation and in the service. The policy or schedule stores who ticked it, when and the exact text (`monthlyPayAcknowledgement`), and the audit entry records it.
3. **Older monthly policies are flagged until acknowledged** (owner): they keep paying as before, show "Risk not acknowledged" with an Acknowledge button on the policies screen, and appear on the dashboard as a compliance risk until then. An older monthly schedule asks for the tick when its frequency is next saved.
4. **Bi-weekly:**
   - Periods are 14 days, counted from an anchor date on the schedule (the end of one period; owner). The cutoff weekday comes from it.
   - 26 ÷ 12 periods a month for per-period amounts; monthly contributions on the month's last period when the policy says "last cutoff".
   - The 13th-month estimate pays 12 ÷ 26 of a monthly salary per period.
   - Withholding: the BIR publishes no bi-weekly table, so the template's is the annual table ÷ 26, kept as rule data. A rule version without one refuses a bi-weekly run with a message to publish a new version (owner); rule versions are never edited.

## Consequences

- Rule versions created before this change have no bi-weekly table.
- Nothing yet checks that a schedule's frequency matches its payroll policy's (gaps B28).
- Tests: `tests/domains/payroll/pay-frequency-phase-6.test.ts`, `tests/app/schedule-dialog.test.tsx`, `tests/app/create-payroll-policy-dialog.test.tsx`.
