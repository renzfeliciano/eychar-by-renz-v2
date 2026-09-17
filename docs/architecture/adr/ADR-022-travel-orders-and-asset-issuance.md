# ADR-022: Travel Orders and Asset Issuance, based on the legacy v1 modules

## Status

Accepted

## Context

The user asked for two more modules mirrored from the legacy v1 app (`PCAS-WorkforceHub`): Travel
Orders Logging (dispatch one or more employees for a date range) and Asset Issuance Logging (track
company assets issued to an employee). As with Cases and Recruitment earlier, the v1 source
(`src/repositories/models/travel-order-model.ts`, `asset-issuance-model.ts`,
`src/schemas/travel-order.ts`, `asset-issuance.ts`, and their services/UI) was read directly rather
than re-derived from a one-line domain description.

## Decision

- **Travel Orders**: `TravelOrder` (`organizationId`, `employeeIds[]` ref Employee, `startDate`,
  `endDate`, `remarks?`, `status: "scheduled" | "cancelled"`). v1 allows a hard delete;
  this app never does (AGENTS.md §53), so a travel order that's called off is `cancel()`led
  (status flips to `"cancelled"`) instead of removed — the UI's "×" button on a row maps to an
  HTTP `DELETE` that performs this soft cancel server-side, keeping the same one-click UX v1 had
  without violating the no-hard-delete rule. `assertEmployeesExist()` batches the existence check
  with one `countDocuments` call instead of v1's N parallel `findById` calls — a reasonable
  efficiency improvement, not a behavior change.
- **Asset Issuance**: `AssetIssuance` (`organizationId`, `employeeId`, `assetName`, `assetType?`,
  `serialNumber?`, `condition` — a fixed `"Good"|"Fair"|"Damaged"|"Lost"` enum matching v1 exactly,
  intentionally **not** turned into an org-managed catalog since v1 itself treats it as a fixed,
  small set, unlike the nine entities the user separately asked to decatalog-code), `issuedDate`,
  `returnedDate?`, `remarks?`. No delete here either — an erroneous entry is corrected via
  `update()`, and there's no natural "cancelled" state the way a travel order has.
- **UI placement deliberately deviates from v1**: v1 gives Asset Issuance its own top-level
  "look up an employee" page before showing that employee's records. This app already has exactly
  that lookup — the People roster plus its per-employee detail page — so Asset Issuance is a new
  "Issued assets" card on `/people/[id]` instead of a second, parallel employee-search flow.
  Travel Orders, by contrast, isn't naturally employee-detail-scoped (one order spans several
  employees), so it keeps its own top-level page and nav entry, matching v1.
- Both got the same UI treatment already standard in this app: required-field asterisks +
  `RequiredFieldsHint`, useful placeholders, a `Textarea` for remarks, and dedicated permission
  keys (`travel-orders.create/read/update`, `asset-issuances.create/read/update`).

## Consequences

- No CSV export or print report for Travel Orders yet, unlike Cases/People — can be added the
  same way (`src/lib/csv.ts` + a Tailwind `print:block` report) if asked; deferred here to keep
  this batch scoped to the CRUD itself.
- A travel order's `employeeIds` are resolved to names at read time from Employee/Person, the
  same "derive at read time" precedent as every other reference field in this app, so a later name
  correction shows up on existing travel orders too.
