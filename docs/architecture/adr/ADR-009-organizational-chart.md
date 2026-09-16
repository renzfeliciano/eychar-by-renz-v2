# ADR-009: Organizational chart as a projection

## Status

Accepted

## Context

AGENTS.md §18 is explicit that the org chart is **not a source of truth** — it's a projection of
`OrganizationUnit`, `Position`, `EmployeeAssignment`, `Project`, and `Employee`, which must
support search, unit/position/project filtering, vacant positions, and historical date
selection.

## Decision

**Tree shape**: the chart is a **reporting-relationship tree** (`EmployeeAssignment
.reportsToEmployeeId`), not the `OrganizationUnit` parent/child hierarchy — Phase 2's
`/organization/units` page already browses the unit catalog; "org chart" in ordinary usage means
who-reports-to-whom, and that's the tree `OrgChartService.getSnapshot()`
(`src/domains/workforce/org-chart-service.ts`) builds.

**Historical view**: `getSnapshot(organizationId, { asOf })` runs one bulk query over
`EmployeeAssignment` with the same effective-dating filter
(`effectiveFrom <= asOf <= effectiveTo|null`) `EmployeeAssignmentService.getAsOf` already uses
per-employee (ADR-005) — generalized to the whole organization in a single query rather than one
query per employee, since `transfer()` always closes the prior row exactly when the new one
starts, so at most one row per employee matches at any given date.

**Vacant positions** are a separate list, not slotted into the tree — an active `Position` with
no assignment referencing it as of the snapshot date has no reporting-relationship data to place
it with, and inventing one would fabricate data the projection doesn't have.

**Filtering re-roots, it doesn't preserve ancestor chains**: `search`/`organizationUnitId`/
`positionId`/`projectId`/`employmentStatus` narrow the employee set *before* the tree is built. An
employee whose manager didn't match becomes a root in the filtered view — showing "only Project
A" and still dragging in an unrelated manager to explain the hierarchy would defeat the filter's
purpose.

**Cycle safety**: only a direct self-report is blocked at write time
(`employee-assignment-service.ts`'s `validateAssignmentRefs`); nothing prevents a multi-hop cycle
(A reports to B, B reports to A). `getSnapshot` walks each node's manager chain with a
visited-set before attaching it as a child; if the walk revisits a node, the *starting* node is
surfaced as a root instead of being attached — this guarantees termination and guarantees no
employee is silently unreachable from every root, at the cost of not trying to guess which single
edge in the cycle is "wrong."

**No new permission key**: `GET /api/organization-chart` requires `employees.read` — the chart
has no data of its own to protect; it's a read-only view over data `employees.read` already
gates. Introducing e.g. `organization-chart.read` would be a permission for a resource that
doesn't exist.

**UI shape**: an indented hierarchical list, not a canvas/SVG diagram with boxes and connecting
lines. A graphical chart (pan/zoom, collapsible nodes, layout algorithm) is real front-end
investment that isn't justified before there's a concrete need for it at real data volumes
(AGENTS.md §56), and an indented list is inherently mobile-first (§41) without any extra library.

## Consequences

- `tests/domains/workforce/org-chart-service.test.ts` reproduces the same historical scenario as
  Phase 3's required test (ADR-005) at the organization level, proving the projection is
  reconstructed from effective-dated records for a historical date, not just for "now."
- If a real multi-hop reporting cycle is ever observed in production data, its members show up
  disconnected at the top level rather than crashing the page or vanishing — a visible symptom to
  investigate, not a silent data-loss bug.
- If a future phase needs a graphical chart (e.g. for a print/export view), it can be built as an
  additional rendering of the same `OrgChartSnapshot` shape — the projection logic doesn't need
  to change, only how it's drawn.
