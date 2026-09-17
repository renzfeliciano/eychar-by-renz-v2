# ADR-018: Case monitoring mirrors the legacy v1 app's schema

## Status

Accepted

## Context

Phase 8's Cases domain was first built with an employee-centric shape (`title`, `classification`,
`status`, optional `employeeId`, `description`/`notes`, `openedAt`/`closedAt`). The user asked
that it instead mirror the legacy v1 app's real, already-shipped Case Monitoring module
(`src/features/case-monitoring/**`), which has a materially different shape: a case is tied to a
**Project**, not an employee, and carries `caseName`/`caseNumber`/`legalCounsel`/`briefHistory`
fields that don't map onto the first draft at all. This reflects what these cases actually are for
a property-management company like PCAS — SeNA/labor, criminal, civil, and regulatory matters
tied to a property/site, only sometimes involving a specific employee.

## Decision

- **`Case`** (`organizationId`, `projectId` required ref `Project`, `caseName`, `caseNumber`,
  `classification`, `status`, `legalCounsel?`, `briefHistory?`) — no `employeeId`, no
  `description`/`notes`, no `openedAt`/`closedAt` (createdAt/updatedAt from `timestamps: true`
  cover that need, matching v1 exactly). `classification`/`status` are plain trimmed Strings
  validated via `CaseClassificationService`/`CaseStatusService.assertValidCode` — the same
  catalog-driven pattern used everywhere else, not a hardcoded enum.
- **Full edit, one reused form.** `CaseService.update()` replaces every field in one call
  (`caseSchema` is reused for both `createCaseSchema` and `updateCaseSchema`), matching v1's
  single `CaseRecordFormDialog` used for both create and edit. `CaseFormDialog` on the client
  mirrors this with an `initialCase` prop toggling between the two modes.
- **CSV export and print report**, matching v1's actual feature set for this module (not just
  its schema). `src/lib/csv.ts` (`buildCsvContent`/`downloadCsv`, BOM-prefixed for Excel) is a
  direct port of v1's helper. `CasePrintReport` is a hidden-until-`@media print` component
  (`hidden print:block` — a Tailwind utility, not a bespoke CSS class, to stay consistent with
  this codebase's Tailwind-first styling convention) rendering every case with brief history in
  its own full-width sub-row, exactly like v1's report.
- **No hard delete.** v1 supports permanently deleting a case record; this codebase's own
  AGENTS.md §53 rule (append-only, status transitions instead of deletes) takes precedence over
  matching v1 on this one point — a case is retired via its `status` catalog value instead.

## Consequences

- `tests/domains/cases/case-service.test.ts` proves: a case is created tied to a project, a
  project from another organization is rejected, an unconfigured classification/status is
  rejected once the catalog has at least one item, a full edit updates every field including
  status, and listing sorts by `createdAt` descending.
- Any future Cases enhancement should keep checking v1's actual behavior first (this ADR exists
  specifically because the first draft skipped that step) rather than re-deriving the domain
  from AGENTS.md's one-line mention of "Cases" in its phase list.
