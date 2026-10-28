# ADR-052: Changing employment terms within the same employment

## Status

Accepted. Extends ADR-019 (end of contract) and AGENTS.md §14 (Employment).

## Context

HR reported (concerns deck, 27 Oct 2026) that the dashboard's "Review 7 contracts ending soon"
listed people who are already regular. The records said otherwise: all seven were still
Probationary or Contractual in EychAr, with their old end dates, because nothing in the app could
change an employee's type. Regularizing someone, or renewing a contract, had no screen; the only
ways to touch an employment were hire and terminate.

A new `Employment` row per change was the obvious effective-dated answer, but the app reads the
hire date as the current employment's `effectiveFrom` (length of service, the probation deadline,
"joining" on the dashboard, the roster). A regularization is not a new hire: by law and in HR's
eyes the same employment continues, and service counts from the original hire.

## Decision

- **Change the current employment in place, and keep the history on it.** `Employment.termsHistory`
  holds each change in order: the new type and end date, the day it takes effect, what it replaced,
  the note, who recorded it and when. `effectiveFrom` stays the hire date. A rehire is still a new
  row (unchanged).
- **One service operation:** `EmploymentService.changeTerms` (PATCH
  `/api/employees/[id]/employment/terms`, `employees.update`). It refuses: no open, active
  employment; an unknown type; a type that needs an end date without one; an effective date before
  the hire date; an end date before the effective date; a change that changes nothing. Audited as
  `employment.terms_changed` with before and after.
- **A type without an end date clears it.** Moving to Regular drops the old end of contract.
- **Whether a date counts is catalog data.** `src/domains/workforce/contract-terms.ts` reads
  `EmploymentType.metadata.requiresEndOfContract`. The dashboard, the roster's "Contracts ending"
  figure and list (`/people?contracts=ending`), and the profile ignore an end date on a type
  configured without one. A code the catalog doesn't list keeps its date, so nothing that showed
  before disappears silently.
- **UI:** "Change employment" on the profile header; the Job & history tab shows the hire and every
  change as "Employment terms".

## Consequences

- The seven records clear once HR regularizes or renews each one; no data migration was run.
- History of terms lives inside the employment document (bounded: a handful of changes per
  employment), read with it, never queried on its own. If terms ever need querying across
  employees by date, move them to their own effective-dated collection.
- A change takes effect in the record as soon as it's saved, even with a future effective date;
  there are no scheduled changes.
