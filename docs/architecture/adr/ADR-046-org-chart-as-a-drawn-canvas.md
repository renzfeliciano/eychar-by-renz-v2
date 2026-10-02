# ADR-046: The org chart is a drawn canvas, not "reports to"

## Status

Accepted (October 2026). Supersedes ADR-009.

## Context

ADR-009 made the org chart a read-only projection of `EmployeeAssignment.reportsToEmployeeId`.
In practice HR found that rigid:

- Reporting lines in a project-based organization don't follow one manager field. HR wanted to
  draw the structure the way they explain it, including named group boxes ("Operations",
  "Site A") with a head under them.
- "Reports to" appeared in four places (hire form, transfer form, Job tab, profile facts), was
  effective-dated with every transfer, and was rarely kept current.

## Decision

- One `OrgChart` document per organization (`src/server/db/models/org-chart.ts`): cards
  (`person` with an `employeeId`, or `group` with a label), each with a color and an x/y, plus
  links `{ from: parent, to: child }`.
- HR draws it on a free canvas (`/organization/chart`). Dragging the dot on top of a card onto
  another card means **"this person reports to that one"**. One card can have any number of cards
  under it, and every link change re-arranges the chart into a tidy tree.
- The chart is saved whole (`PUT /api/organization-chart`, permission `org-chart.update`) and
  audited as `org-chart.updated`. Reading it needs `employees.read`.
- Every save must be a forest (`chartProblems` in `src/domains/workforce/org-chart-tree.ts`): no
  loops, at most one parent per card, and no links to missing cards. The same pure module runs in
  the browser and on the server.
- `reportsToEmployeeId` is removed from the assignment model, validation, services and UI.
  Until an organization's first save, the chart is built from whatever `reportsToEmployeeId`
  values old assignment rows still hold, read raw from the collection, so no one loses their
  existing structure.
- Deleting an employee needs no chart patch. `OrgChartService.get` hides cards for people who no
  longer exist, along with their links. Restoring them from the recycle bin brings both back.

## Consequences

- The chart is now a source of truth for reporting lines. It isn't effective-dated, so there's
  no "as of a date" view; the audit log records each save.
- Nothing else reads reporting lines today. Leave approval routing, if it ever needs a manager,
  must read the chart, not an assignment field.
- Old `reportsToEmployeeId` values stay in old documents until someone cleans them up. They're
  harmless and are only read for the first draft.
