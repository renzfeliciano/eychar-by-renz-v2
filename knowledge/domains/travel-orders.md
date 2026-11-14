# Travel Orders

**Purpose:** log that one or more employees are dispatched for a date range (ADR-022, mirroring the legacy v1 Travel Orders module). Cancellation is a status change, never a delete. Timing (scheduled, ongoing, completed) is derived from the dates.
**Governing docs:** ADR-022 (travel orders and asset issuance), ARCHITECTURE.md § Travel Orders & Asset Issuance (ADR-022), ENGINEERING.md § 53 (database safety: no hard deletes), § 37 (domain services).
**Services:**
- `src/domains/travel-orders/travel-order-service.ts`: `TravelOrderService.create`, `update` (full edit), `cancel` (status `cancelled`), `listCurrent(orgId)` (sorted by `startDate` desc), `getById`. Private `assertEmployeesExist`, `assertDateOrder`.
- `src/domains/travel-orders/travel-timing.ts` (pure): `travelTiming(order, todayKey)` returns scheduled / ongoing / completed / cancelled. `timelineBars(orders, fromKey, days)` returns column spans for the timeline, excluding cancelled orders.

**Models:**
- `src/server/db/models/travel-order.ts` (`TravelOrderModel`): `employeeIds[]` (ref Employee, at least one), `startDate`, `endDate`, `remarks`, `status` (string, default `scheduled`; the schema has no enum, the service only writes `scheduled` or `cancelled`). Index `(organizationId, startDate)`. Hidden plugin applied.
- Reads `EmployeeModel` for existence checks.
- Read by `EmployeeRecords.travelOrders` in `src/domains/people/employee-records.ts` (the profile's travel tab).

**Routes:**
- `src/app/api/travel-orders/route.ts`: GET (`travel-orders.read`), POST (`travel-orders.create`).
- `src/app/api/travel-orders/[id]/route.ts`: PATCH (`travel-orders.update`, full edit), DELETE (`travel-orders.update`, calls `cancel`). The DELETE verb is cancel, not removal.

**Pages:**
- `src/app/(app)/travel-orders/page.tsx`: list, monthly count, timeline. Computes `todayKey` with `localDateKey()` from `src/lib/date-key.ts` and passes it to `travelTiming`.
- `travel-order-form-dialog.tsx` (create and edit), `cancel-travel-order-button.tsx`, `travel-timeline.tsx` (uses `timelineBars`), `travel-order-export-actions.tsx`, `travel-order-print-report.tsx`, `loading.tsx`.
- Dashboard: `src/app/(app)/dashboard/page.tsx` imports `TravelOrderService`.
- Profile: `src/app/(app)/people/[id]/page.tsx` (via `EmployeeRecords`).

**Tests:**
- `tests/domains/travel-orders/travel-order-service.test.ts`
- `tests/domains/travel-orders/travel-timing.test.ts`
- `tests/app/travel-timeline.test.tsx`

**Rules a change must respect:**
- Names and numbers are not copied onto the order. They are resolved from Employee and Person at read time (comment `travel-order-service.ts` lines 8-12).
- Every employee id must belong to the organization. `assertEmployeesExist` counts matches against the number of unique ids (lines 14-20).
- `endDate` must be on or after `startDate` on both create and update (`assertDateOrder`, lines 22-24, called at lines 29 and 59).
- Cancel is a status change. Never remove the document (ENGINEERING.md § 53; `cancel`, lines 82-103).
- Timing is never stored. `travelTiming` reads `status` only to detect `cancelled`. Scheduled, ongoing and completed come from `todayKey` (`travel-timing.ts` lines 129-134). Any new status must go in `travelTiming` and `timelineBars`, which both check `status`.
- Hidden test data: travel orders use the hidden plugin, so Super Administrator hiding works through the query plugin (see `visibility.md`).

**Known gaps / mismatches:**
- `update` does not check whether the order is cancelled. A cancelled order can be edited, and its dates and employees changed, while staying cancelled (`travel-order-service.ts` lines 53-80).
- `cancel` hard-codes `before: { status: "scheduled" }` in the audit record (line 98). That is wrong for a cancelled order's history, though the stored status is only ever `scheduled` or `cancelled`, so it is always correct for the one transition allowed.
- `employeeIds` duplicates are not rejected. The count check compares found documents with the Set size, so `[A, A]` passes and is stored with a duplicate (`assertEmployeesExist`, lines 14-20; the validator in `src/shared/validation/travel-orders.ts` line 6 has no uniqueness rule).
- `listCurrent` returns every order for the organization with no pagination.
- `status` on the model has no enum, so an unexpected value written outside the service would be treated as "not cancelled" by `travelTiming`.

**Last verified:** 6587050.
