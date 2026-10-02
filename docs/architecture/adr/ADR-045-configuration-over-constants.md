# ADR-045: Configuration over constants (time zone, money, catalog meaning, pay premiums)

## Status

Accepted. Applies AGENTS.md §2 ("model the business") to rules that had slipped into code.

## Context

A review found business rules and locale assumptions written as constants: which case statuses
count as closed, which recruitment stage means hired, overtime and rest-day premiums, the
13th-month divisor, a hardcoded list of contribution names, fixed gender buckets, three different
peso formatters, and timestamps formatted in the server's time zone (UTC on Vercel, 8 hours off
for Manila).

## Decision

- **Time:** instants go through `formatDateTime` / `formatDate` / `formatTime` in
  `src/lib/app-time.ts`, which always use `APP_TIME_ZONE`. Calendar dates stored as UTC midnight
  go through `formatCalendarDate` / `formatDateKey` (UTC). No bare `toLocale*` without a time zone.
- **Money:** one formatter, `src/lib/money.ts` (`formatMoney`, `formatAmount`, `roundMoney`), with
  half-away-from-zero centavo rounding shared by the payroll engine and every screen. Negatives
  print as `-₱5.00`.
- **Catalog meaning lives in catalog metadata:** case statuses carry `isClosed`, recruitment stages
  `isHired` (alongside the existing `isActiveHeadcount` and `isTerminal`). An explicit flag always
  wins; the old code lists (`dismissed/closed/resolved/settled`, `hired`) are only a fallback for
  items saved before the flag existed, so existing data reads the same.
- **Pay premiums are payroll policy fields:** `overtimeMultiplier` (default 1.25),
  `restDayMultiplier` (1.3) and `thirteenthMonthDivisor` (12) on `PayrollPolicy`, which is
  effective-dated, project-overridable and referenced by each run, so a run stays reproducible.
  Defaults equal the Philippine Labor Code / PD 851 values; older policies without the fields read
  as the defaults (`payPremiumsOf`). The employer-contribution hint is built from the run's own
  rule version.
- **Dashboard gender buckets** come from the stored values, with "Not specified" for none.

## Consequences

- The catalog editor doesn't edit metadata flags yet; `isClosed` / `isHired` can be set through the
  catalog API's `metadata`. A flag editor is a follow-up.
- Overtime and rest-day pay are still entered as payroll adjustments; the multipliers drive the
  hints and the settlement math, not an automatic overtime calculation.
- The currency itself (PHP, en-PH) is one constant in `src/lib/money.ts`, not organization config.
