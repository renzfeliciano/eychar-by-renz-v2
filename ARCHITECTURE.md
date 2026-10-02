# Architecture

EychAr by Renz (EychAr /eɪtʃ ɑːr/, formerly WorkforceHub — ADR-036) is a configurable,
multi-tenant-capable HRIS platform. The database describes
the business (organizations, people, roles, permissions); the application code provides reusable
capabilities on top of that data. See [AGENTS.md](./AGENTS.md) for the full engineering
instructions this repository is built against.

## Status

**Phase 8 complete** (see AGENTS.md §57) — every named sub-phase (Recruitment, Performance,
Cases, Assets, Documents, Events) is implemented, on top of Phases 1–8c, plus several ad hoc
enhancements beyond the original phase list: employee self-service attendance (ADR-020), Travel
Orders and Asset Issuance mirrored from the legacy v1 app (ADR-022), and custom roles/staff
accounts (ADR-023). Implemented: Organization, User, Person, Role, Permission, RoleAssignment,
AuditLog, OrganizationUnit, Position, Location, Project, Employee, Employment,
EmployeeAssignment, AttendancePolicy, AttendanceRecord, WebAuthnCredential (self-service
biometrics, ADR-020), LeaveType, LeavePolicy, LeaveBalance, LeaveRequest, PayrollPolicy,
PayrollRuleVersion, Compensation, PayrollRun, PayrollRecord, PayrollAdjustment, EmploymentType,
EmploymentStatus, AttendanceStatus, RecruitmentStage, EventCategory, CaseClassification,
CaseStatus, PerformanceRating, DocumentType (org-managed catalogs, ADR-016), Applicant
(Recruitment, ADR-015), ReviewCycle, PerformanceReview (Performance, ADR-017), Case (Case
monitoring, ADR-018), TravelOrder, AssetIssuance (ADR-022), Event (ADR-024), EmployeeDocument
(ADR-025), Holiday and DayNote (holiday calendar and day notes, ADR-035); server-side authorization with a granular per-resource permission catalog, now with
HR-editable custom Roles on top (ADR-023); append-only audit logging; Auth.js credentials
(username-or-email) login with single-active-session + idle-timeout enforcement; a shadcn/ui
dashboard, `/organization/{units,positions,locations,projects,chart}`, `/people` (with
Age/Length-of-service columns, statutory ID fields, CSV export + print — ADR-019),
`/attendance{,/policies}` (HR-recorded) plus a separate self-service `/clock` portal (WebAuthn
biometric + geolocation + photo, ADR-020), `/leave{,/types,/policies,/balances}`,
`/payroll{,/policies,/rule-versions,/compensation}`, `/recruitment/tracking` (drag-and-drop
Kanban), `/performance{,/[id]}`, `/cases` (CSV export + print), `/travel-orders` (CSV export +
print), "Issued assets" and "Documents" sections on `/people/[id]`, `/events` (month calendar),
`/settings/catalogs`, and `/settings/access` (roles, role assignments, staff accounts).

## Architecture style

Domain-oriented modular monolith (ADR-001). No microservices, no message broker, no Redis —
none of those have a concrete requirement yet (AGENTS.md §45).

## Directory structure

```
src/
├── app/
│   ├── (auth)/login/     Unauthenticated, outside the app shell
│   ├── (app)/            dashboard, organization/*, people/*, attendance/*, leave/* — shared sidebar+topbar layout
│   ├── _shared/          getCurrentOrganization/hasPermission — used by every (app) page
│   └── api/               Route handlers
├── components/
│   ├── ui/                shadcn/ui primitives (copied in, not an opaque dependency)
│   └── shared/            PageHeader, DataTable, StatusBadge, FormField, OptionSelect, AppShell
├── domains/        Domain services — business logic, one folder per bounded domain
├── server/         Cross-cutting server infrastructure: db, auth, authorization, audit
└── shared/         Validation (Zod), error types, shared TS types
```

Route handlers orchestrate: Authenticate → Validate → Resolve Context → Authorize → Execute
(domain service) → Persist → Audit → Return. They do not contain business logic themselves
(AGENTS.md §37). See ADR-013 for the UI/design-system layer.

## Identity model (ADR-003)

`User` (login identity) → `Person` (human identity) → `Employee` (workforce identity) →
`Employment` (lifecycle) → `EmployeeAssignment` (where/what/who) — five distinct models, per
AGENTS.md §13. A `Person` is not assumed to be an `Employee` (Phase 1's HR user has no `Employee`
record at all); an `Employee` has no status field of its own — see "Workforce (Phase 3)" below.

## Organization structure (Phase 2)

`OrganizationUnit` (self-referencing `parentUnitId`, free-form `type`), `Position`, `Location`,
`Project` (`locationId?`) — see ADR-004 (Position vs Role)
and ADR-006 (Effective Dating) for the two decisions specific to this phase. No hard delete
anywhere (AGENTS.md §53); every domain service exposes `create()` and `updateStatus()`
(active/inactive, plus `effectiveTo` for the two effective-dated models) but never a delete.

## Workforce (Phase 3)

`Employee` is pure identity (`personId`, `employeeNumber`) — no status field, since "is this
employee active" is answered by their latest `Employment`, not a second flag that could drift out
of sync. `Employment` is the effective-dated lifecycle (`employmentType` free-form,
`status: active|on_leave|terminated`); a rehire is just a new row, not a special case.
`EmployeeAssignment` is where/what/who (`positionId?`/`organizationUnitId?`/`projectId?`/
`locationId?`/`reportsToEmployeeId?`), effective-dated. See ADR-005 for the transfer mechanic —
moving an employee closes the current assignment and creates a new one, never an in-place edit,
which is what makes historical reconstruction (`getAsOf(employeeId, date)`) possible.
`HireService.hire(...)` orchestrates Person → Employee → Employment → EmployeeAssignment as three
separately audited writes for a new hire, not one Mongo transaction (see ADR-005's consequences).
A transfer's close-old/open-new pair does run in one transaction (ADR-041).

`Person` also carries `gender`/`birthDate`/`address`/`phone` and statutory ID numbers (SSS/
PhilHealth/Pag-IBIG/TIN, format-validated), and `Employment` carries an optional `endOfContract`
(required only when the selected `EmploymentType`'s `metadata.requiresEndOfContract` is set) —
added per ADR-019 to match the legacy v1 app's Employee Roster fields on top of this codebase's
existing Person/Employment/EmployeeAssignment split, rather than flattening back to one document.
`/people` computes Age and Length of Service at read time from `birthDate`/`effectiveFrom`
(`src/lib/employee-dates.ts`) and offers CSV export + a print report, both covering every row
matching the current Employment-type filter, not just what's visible.

## Organizational chart (Phase 4, ADR-009)

A projection, not a source of truth (AGENTS.md §18) — `OrgChartService.getSnapshot(organizationId,
filters)` (`src/domains/workforce/org-chart-service.ts`) builds a reporting-relationship tree
(via `EmployeeAssignment.reportsToEmployeeId`) from a single bulk as-of-date query, the same
effective-dating filter `EmployeeAssignmentService.getAsOf` uses per-employee, generalized to the
whole organization. Vacant positions (active `Position`s with no current assignment) are a
separate list, not slotted into the tree. No new collection, no new permission key — `GET
/api/organization-chart` requires the existing `employees.read`.

## Attendance (Phase 5, ADR-011)

`AttendanceService.record()` (`src/domains/attendance/attendance-service.ts`) is **HR-recorded**
attendance: resolves the employee's project as of the record's date
(`EmployeeAssignmentService.getAsOf`), resolves the applicable `AttendancePolicy` for that
project+date (`AttendancePolicyService.resolve`, ADR-011), and computes `present`/`late` from the
check-in time unless an explicit status is given — computed and stored once, never recomputed
later. `adjust()` is gated by `attendance.update` and writes a full before/after audit entry,
which is this phase's approval record rather than a separate request/approve workflow (that's
Phase 6's pattern).

## Employee self-service attendance (Phase 5 enhancement, ADR-020)

A second, independent way to produce an `AttendanceRecord`: `User.employeeId` marks an account as
self-service (HR-provisioned via `EmployeeAccountService.create()`, never auto-created at hire).
Such a session is redirected straight to `/clock` — a route group with no HR sidebar — and every
self-service API route is gated by `requireSelfServiceEmployee()`
(`src/server/authorization/require.ts`), which resolves the employee strictly from the session's
own `User.employeeId` and never touches the granular permission catalog at all.
`SelfServiceAttendanceService.checkIn()`/`.checkOut()` (`src/domains/attendance/
self-service-attendance-service.ts`) reuse `AttendanceService`'s `computeStatus()`, but hard-require
a fresh `WebAuthnService.verifyAuthentication()` (platform authenticator — Face ID/fingerprint/
screen lock, via `@simplewebauthn/server`) before writing anything. See ADR-020 for the full set
of tradeoffs the user chose explicitly (full self-service login over a shared kiosk; both WebAuthn
and photo, not one; HR-provisioned accounts; photos stored as base64 in MongoDB).

**Geofence + liveness (ADR-026).** Clock-in now also requires the employee to pick a project that is
a clock-in site (an active project whose active `Location` has `latitude`/`longitude` +
`geofenceRadiusMeters`, resolved by `ClockSiteService`), to be within that radius (server-checked in
`SelfServiceAttendanceService` via `geofence.ts`; out-of-range attempts are blocked and audited), and
to pass a randomized blink/head-turn check (MediaPipe Face Landmarker, self-hosted under
`public/mediapipe`, logic in `src/lib/liveness/liveness-session.ts`) whose live frame becomes the
photo. The record stores `projectId` plus a per-event snapshot of distance, radius and challenges;
late/present uses the selected site's attendance policy. This supersedes ADR-020's "geolocation and
photo are best-effort" rule.

**Schedules (ADR-027).** `/attendance/schedules` lets HR plan each employee's month from reusable
`ShiftTemplate`s (work shifts with times, overnight allowed, or rest days), with an optional project
per work day. Each `ScheduleEntry` embeds a snapshot of its shift, so editing a template never
rewrites a planned or exported month. The plan is reference-only: late/present still follows
`AttendancePolicy`. The clock screen pre-selects today's scheduled project. Exports are a
print-ready Excel month grid and a long-format CSV (`/api/attendance/schedules/export`). It reuses
`attendance.read`/`attendance.update`.

**Attendance export (ADR-028).** The daily roster exports any range of up to 31 days
(`/api/attendance/export`) as Excel (a filterable log plus a per-employee status/hours summary) or
CSV. It has one row per employee per day, with "No record" where nothing was logged, and the
scheduled shift beside the recorded times. `AttendanceReportService` builds it, and it lists the
same people the schedule does (`current-staff.ts`). Every module's Export button (People, Case monitoring, Travel
orders, Attendance, Schedules) now offers the same two formats: a formatted Excel file built from
a shared template, or CSV. See the ADR-028 addendum.

## Leave (Phase 6, ADR-012)

Same HR-recorded scoping as Attendance — leave is requested on an employee's behalf, not
self-service. `LeaveType` is a seeded catalog (`requiresApproval` per type); `LeavePolicy`
resolves Organization→Project override the same way `AttendancePolicy` does, via the shared
`resolveOrgProjectPolicy()` extracted in ADR-011 once Leave needed the identical shape.
`LeaveBalance` stores only `entitledDays`/`adjustmentDays` — "used" days are derived at read
time (`LeaveBalanceService.getAvailable`) from the sum of `approved` `LeaveRequest.totalDays`,
never a stored counter that could drift. `LeaveRequestService.create()` rejects a request that
exceeds the available balance or overlaps an existing pending/approved request for the same
employee; `decide()` (gated by `leave.approve`, distinct from `leave.update`) is the real
request/approve state machine Phase 5 deferred — see ADR-012 for why `leave.approve` is its own
permission and why balance consumption is derived rather than stored.

`/leave/balances` shows one row per employee, with leave types as columns and a year selector. Each
cell shows days left, a used/pending bar and the counts. `LeaveBalanceService.summarizeForYear()`
builds the whole year in two queries. `grantMissing()` opens a leave type for everyone who doesn't
have it yet, audited as one batch.

Leave balances can be granted/adjusted from two places sharing the same components: the org-wide
`/leave/balances` list (bulk view across every employee, e.g. year-end rollout) and a "Leave
balances" card on `/people/[id]` (per the user's own workflow — granting one employee's balance
without hunting them down in a dropdown first). `GrantLeaveBalanceDialog` is employee-page-scoped
(no employee picker, `employeeId` comes from the page); `AdjustLeaveBalanceDialog`
(`src/components/shared/`) is shared by both since it only ever needs a `balanceId`, used
identically from either page.

## Payroll (Phase 7, ADR-014; rebuilt in ADR-029)

**Current design (ADR-029).**

- **Engine:** a pure calculation engine (`src/domains/payroll/engine/`) computes each payslip.
  - Monthly-rated pay: the period's share of the salary, less absences and tardiness.
  - Daily-rated pay: days worked × the rate.
  - Contributions come from PH tables stored as rule-version data (SSS table, PhilHealth,
    Pag-IBIG), with employer shares.
  - Withholding tax applies to taxable pay less contributions, using the BIR table for the pay
    frequency.
- **Runs:**
  - They go Draft → Submitted → Approved/Returned → Released, and can be cancelled before
    approval.
  - Each is scoped to the organization or one project, and guarded against paying the same people
    twice for the same days.
  - Each run keeps its payslips, register exports and full history.
- **Payroll schedules** prepare each cutoff's draft automatically.
- **Compensation:** each employee has calendar-dated pay terms (monthly or daily rate, allowances,
  minimum-wage-earner flag). Bulk changes (e.g. a wage order for a project) are previewed, then
  applied as one batch.

The paragraphs below describe the original Phase 7 design. Where they conflict with ADR-029,
ADR-029 wins.

Same HR-recorded scoping as Attendance/Leave. `PayrollPolicy` (pay frequency, standard work
days/period) and `PayrollRuleVersion` (tax brackets, statutory contributions) both resolve
Organization→Project override independently via `resolveOrgProjectPolicy()` — the shared
resolver's third caller, after Attendance and Leave. `PayrollRuleVersion` is never edited in
place: a correction creates a new, auto-numbered version, so a `PayrollRun`'s snapshotted
`policyId`/`ruleVersionId` always identify exactly what was used, satisfying AGENTS.md §28's
reproducibility requirement directly. `Compensation` (base salary + allowance per pay period) is
its own effective-dated model, deliberately separate from `Employment` (see that model's own
comment) and revised via the same transfer mechanic as `EmployeeAssignment`.

`PayrollService.generateRun()` computes Basic Salary (prorated against `AttendanceRecord`
absences — `"on_leave"` rows don't count, no Attendance/Leave model changes needed) and
Tax/Statutory Contributions (via a generic progressive-bracket formula applied to seeded rule
data — never a hardcoded formula) automatically; Overtime, Holiday Pay, Night Differential,
Bonuses, 13th Month, Loans, and Other Deductions are HR-supplied `PayrollAdjustment` line items
at generation time rather than derived from attendance clock-in/out (no `HolidayCalendar` model
exists yet). Every employee's record is computed fully in memory before any write — see ADR-014
for why computation happens before any write; the write step itself (replace records + totals)
runs in one transaction (ADR-041, `src/server/db/transaction.ts`). `approve()` is gated by
`payroll.approve`, its own permission (same precedent as `leave.approve`).

## Catalogs (Phase 8 foundation, ADR-016)

Employment statuses, employment types, attendance statuses, recruitment stages, event
categories, case classifications, case statuses, and performance ratings are org-managed lookup
lists, not hardcoded option arrays — matching the existing `LeaveType`/`Position`/`Project`
precedent. Each is its own Mongoose model/collection built from a shared
`buildSimpleCatalogSchema()` factory, and each has its own bound service built from a shared
`createSimpleCatalogService()` factory — one schema shape and one CRUD+audit implementation,
reused across all eight, without merging them into one table. A `CATALOG_REGISTRY` maps each
URL-safe slug to `{service, permissionPrefix}` so `/api/catalogs/[type]` stays two route files
instead of one per entity. None of these catalog Add forms ask for a machine "code" — it's
slugified from the name/title server-side (`src/shared/slugify.ts`), the same as `Position`/
`Project`.

`assertValidCode(organizationId, code)` is permissive when an organization hasn't configured any
items for that type (any code is accepted) and strict once at least one item exists (the code
must match an active one) — this is what let `Employment.status`/`employmentType` and
`AttendanceRecord.status` drop their hardcoded `enum` arrays in favor of catalog validation with
zero changes to either domain's pre-existing tests. `metadata` (Mixed, default `{}`) is the
extension point for business-rule hooks — e.g. `EmploymentStatus.metadata.isActiveHeadcount`
drives whether the Terminate button shows on `/people/[id]`, and
`RecruitmentStage.metadata.{sortOrder,isTerminal}` drive the Application-tracking Kanban's
column order and terminal-stage detection — without a business-rules engine existing yet.

`scripts/seed.ts` seeds a starter set of values for every catalog type (sourced from the legacy
v1 app's real "Workspace administration" lists, plus a plain Needs Improvement…Outstanding scale
for Performance ratings) plus real `Position`/`Project` data, each upserted idempotently by
`{organizationId, code}` so re-running `db:seed` never duplicates rows.

## Recruitment (Phase 8a, ADR-015)

Rebuilt to mirror the legacy v1 app's real Application Tracking feature. `Applicant` references
`Position` directly (no `JobOpening`/headcount layer) and `stage` is a catalog code
(`RecruitmentStage`) with **free-form movement in any direction** — no forward-only state
machine, matching v1's plain "Move to" dropdown. `/recruitment/tracking` is a Kanban board using
`@dnd-kit/core` for drag-and-drop between columns (`StageColumn` is a drop target, `ApplicantCard`
is draggable via a grip handle), with the "Move to" select as a non-drag fallback — both call the
same `ApplicantService.moveStage()`. Moving a card to a "Hired"-named stage is just a label; it
does not create an `Employee` record, matching v1's actual (deliberately narrower) scope.

## Performance (Phase 8b, ADR-017)

`ReviewCycle` (`draft → open → closed`, forward-only) is a simple, dated container — HR names
it and sets its period before any review can be recorded against it. `PerformanceReview` links
one `Employee` to one `ReviewCycle` (unique per pair — one review per employee per cycle),
starts in `draft` with no rating, and `submit()` is the one mutating action: it requires a
`ratingCode` that validates against the org's configured `PerformanceRating` catalog (the eighth
simple catalog, same factory as every other one) and locks the review at `submitted` — no
un-submit; a correction is a new cycle's review, matching this codebase's "never edit an audited
stint in place" precedent. There's no separate `.approve` permission (unlike Leave/Payroll) since
submitting is a single-actor action, and no employee-facing acknowledgment step, since this
codebase has no employee self-service portal yet to acknowledge from.

## Case monitoring (Phase 8c, ADR-018)

Rebuilt to mirror the legacy v1 app's real Case Monitoring module. `Case` (`projectId` required
ref `Project`, `caseName`, `caseNumber`, `classification`, `status`, `legalCounsel?`,
`briefHistory?`) ties a case to a property/site, not an employee — matching what these cases
actually are for a property-management org (SeNA/labor, criminal, civil, regulatory matters).
`classification`/`status` validate against the `CaseClassification`/`CaseStatus` catalogs, same
pattern as everywhere else. `CaseService.update()` is a full replace (`caseSchema` reused for
create and update), matching v1's single reused form dialog. `/cases` offers CSV export and a
print report (`hidden print:block`, per ADR-018/019's Tailwind-first print convention) — v1's
hard-delete was intentionally not ported (AGENTS.md §53: no hard deletes anywhere in this
codebase); a case is retired via its `status` catalog value instead.

## People roster paging

The People page reads one page of employees at a time: `EmployeeRosterService.page()` joins each
employee's latest Employment and EmployeeAssignment in an aggregation, then searches, sorts and
pages in the database (`$facet` for rows + total). The summary strip comes from
`EmployeeRosterService.summary()`, which returns counts only. The export and print rows (contact
details, statutory IDs) are no longer embedded in the page: `GET /api/employees/export` serves
them on demand, behind `employees.read`, the `export` rate limit and an `employees.exported` audit
entry. The Leave page (`LeaveRequestService.page` / `summary`), the daily attendance roster
(`AttendanceService.dayRoster`) and the dashboard's leave numbers page or count in the database
too (ADR-044). Other list pages still filter an already-fetched list in memory
(`applyTableQuery`); move one to the same pattern when its organization-wide size makes that slow.

## Travel Orders & Asset Issuance (ADR-022)

Both mirror the legacy v1 app's real modules. `TravelOrder` (`employeeIds[]` ref `Employee`,
`startDate`/`endDate`, `remarks?`, `status: scheduled|cancelled`) has its own top-level
`/travel-orders` page since one order spans several employees, not one. `AssetIssuance`
(`employeeId`, `assetName`, `assetType?`, `serialNumber?`, `condition` — a fixed enum matching v1
exactly, not a catalog — `issuedDate`, `returnedDate?`, `remarks?`) is instead a card on
`/people/[id]` rather than v1's separate employee-lookup page, since the People roster + detail
page already is that lookup. Neither supports v1's hard delete (AGENTS.md §53) — a travel order
is cancelled via `status`, an asset-issuance mistake is corrected via `update()`.

## Events (Phase 8, ADR-024)

Mirrors the legacy v1 app's Workforce Calendar. `Event` (`title`, `date`, `time?`, `category` —
validated against the `EventCategory` catalog, ADR-016 — `description?`, `status:
active|cancelled`). `/events?month=YYYY-MM` follows this app's own `DateNav`-style
URL-param-driven navigation (`MonthNav`) rather than v1's client-side re-fetch on every
prev/next click, so a month's events are already in the initial server render.
`EventService.listForMonth()` only ever returns `status: "active"` rows — no hard delete
(AGENTS.md §53), a cancelled event just stops appearing on the calendar. Clicking a day opens
`EventDayDialog`, the same list-then-form dialog shape as Travel Orders/Asset Issuance.

## Documents (Phase 8, ADR-025)

The last Phase 8 sub-phase, and the only one with nothing in the legacy v1 app to mirror — scope
(employee 201-file documents, not a company-wide library) and storage (base64 in MongoDB, same
call as ADR-020's attendance photos) were confirmed directly with the user rather than inferred.
`EmployeeDocument` (`employeeId`, `title`, `documentType` — the ninth org-managed catalog,
ADR-016 — `fileName`/`fileType`/`fileSize`/`fileData`, `expiresAt?`, `notes?`) lives on a
"Documents" card on `/people/[id]`. **Storage moved to private object storage in ADR-038:** files
go to Vercel Blob (`access: "private"`) through `src/server/storage/document-storage.ts` when
`BLOB_READ_WRITE_TOKEN` is set, else stay inline in `fileData`; `storage { provider, key }` says
which. Uploads are multipart, capped at 4MB; the download route streams the file as an attachment
and is the only way to it. Lists and edits never return `fileData` or `storage`.
No delete of any kind, not even a status flip — a wrong upload is superseded by a new one, never
edited in place at the byte level; `update()`'s schema omits every file field entirely.

## Holiday calendar & day notes (ADR-035)

- **`Holiday`** (`organizationId`, `date` as UTC midnight of the day, `name`, `type:
  regular|special_non_working|special_working`, optional `scope`/`source`, `presetKey` when loaded
  from a preset, `status`). The organization's own data, the `HolidayCalendar` AGENTS.md §25 asks
  for. Removing one cancels it (`status`), never deletes. Index `{ organizationId, date }`.
- **Country presets** (`src/domains/holidays/presets/`) only *propose* a year's holidays. The
  Philippine preset has 2026 checked against Proclamation No. 1006, s. 2025 and No. 1264, s. 2026
  (Eid'l Adha), and builds other years from the standard dates by law (Holy Week from Easter,
  National Heroes Day as the last Monday of August), flagged unverified. HR previews, picks and
  saves (`HolidayService.importPreset`); already-saved days are skipped, never duplicated.
- **`DayNote`**: HR's free-form note per organization per day (unique index), cleared via
  `status: "cleared"`.
- **Schedules day panel**: clicking a date opens its holidays, head-count (working / off / not
  scheduled, by shift), company events (only with `events.read`) and the HR note; editors can add,
  edit (date, name, type, scope, legal basis) or remove a holiday there, and still "Select everyone
  on this day". Edits keep `presetKey`, so a moved proclaimed holiday stays traceable. Date headers carry a holiday dot (rose for
  regular, amber for special non-working) and a note/event dot. A "Holidays" dialog on the page
  manages the year.
- **API**: `GET/POST /api/holidays`, `PATCH/DELETE /api/holidays/[id]`,
  `GET/POST /api/holidays/presets` (preview / import), `PUT /api/attendance/day-notes`. They use
  `attendance.read` / `attendance.update` for now (see Known gaps). Every change is audited
  (`holiday.created|updated|cancelled|preset_imported`, `day_note.saved|cleared`).

## Brand & installable app (ADR-036)

- The product is **EychAr by Renz** (formerly WorkforceHub). Every product string comes from
  `src/lib/brand.ts`; organization names and logos stay data. Page titles use the root layout's
  template (`"Schedules · EychAr by Renz"`), with a `metadata.title` on each page.
- **PWA**: `src/app/manifest.ts` (standalone, shortcuts to Clock, Schedules, People), icons in
  `public/icons` plus `src/app/icon.png`/`apple-icon.png`, and `public/sw.js` registered by
  `ServiceWorkerRegister` in production only. The worker caches only fingerprinted static assets
  and icons and falls back to `public/offline.html` for pages it can't reach; it never caches
  pages or `/api` responses (personal and payroll data). `/sw.js` is served `no-store`.

## Search & link previews (SEO)

- Indexable surface is the sign-in page only. `robots.ts` (allow `/login`, the share image and
  icons; disallow everything else), `sitemap.ts` (`/login`), `noindex` metadata on the `(app)`,
  `(self-service)` and change-password layouts, and `X-Robots-Tag: noindex` on `/api/*` (layered,
  so a leaked link still isn't listed).
- `src/lib/site.ts` resolves the public URL (`NEXT_PUBLIC_SITE_URL` → `NEXTAUTH_URL` → Vercel
  production domain) for `metadataBase`, and builds the description; the organization name comes
  from `SITE_ORGANIZATION_NAME` (deployment config, never hardcoded). The sign-in layout adds a
  canonical link, Open Graph/Twitter cards with `public/og/eychar-share.png`, and JSON-LD.

## Security hardening (ADR-037)

- **Sessions:** a temporary password blocks the API as well as pages; sign-out and password changes
  end the session server-side; an absolute lifetime (`SESSION_MAX_HOURS`, default 12) on top of the
  idle timeout. An ended session says why: signed in elsewhere (with when, browser and site),
  signed out (another tab, password change, admin reset), or idle.
- **Sign-in:** attempts reserved atomically before the password check; unknown logins lock like real
  ones; client IP from the platform (`x-vercel-forwarded-for`) or the right-most trusted hop.
- **Tenancy:** roles only for existing members and only with permissions the giver holds; accounts
  tied to another organization can't be administered from this one; every foreign id is checked
  against the organization (`src/server/db/assert-in-organization.ts`); ids are ObjectId-validated.
- **Files/exports:** uploads allow-listed and checked against their own bytes; CSV formula
  neutralising; exports audited; per-user rate limits (`src/server/security/rate-limit.ts`).
- **Platform:** per-request nonce CSP from `src/proxy.ts` (production), HSTS in production only,
  no `X-Powered-By`, constant-time cron secret checks, PII-free error logs.
- **Required two-step (ADR-039):** `Organization.security.requireTwoStepForStaff`; staff accounts
  (no linked employee) without two-step get `mustSetUpTwoStep` in the token, are refused by
  `requireAuthenticatedUser` except the two-step/password routes, and are sent to `/set-up-two-step`.
- **CI:** `.github/workflows/ci.yml` runs lint, typecheck, tests and build on pushes and PRs; the
  pre-commit hook keeps only lint and typecheck. Cron schedules live in `vercel.json`.
- **Second review (ADR-040):** assignments scoped to the organization; role edits and account resets
  limited to the actor's own access; two-step setup needs the password; leave and payroll state changes
  are conditional updates (payroll recalculation holds a per-run lock); more per-user rate limits; length
  caps on all text input.
- **Dialogs (UI standard):** `DialogContent` keeps header and footer fixed and scrolls only the body
  (children are sorted by `DialogHeader`/`DialogFooter`, or a component's static `dialogSlot`).

## Authorization (ADR-007)

Server-side only, resolved from data on every check — never cached role-name strings, never
`user.role === "..."`:

- `authorize({ userId, organizationId, permission })` — throws unless the user has an active
  (`effectiveFrom <= now <= effectiveTo|null`) `RoleAssignment` in that organization whose `Role`
  carries the permission key.
- `hasActiveRoleAssignment({ userId, organizationId })` — organization *membership* only; kept as
  a documented primitive (AGENTS.md §22) though no route currently calls it (see ADR-007).
- `requireAuthenticatedUser()`, `requireOrganizationAccess(organizationId)`,
  `requirePermission(permission, organizationId)` — the primitives route handlers call.

Permission keys are granular per resource — `<resource>.create` / `<resource>.read` /
`<resource>.update` (e.g. `positions.read`), matching AGENTS.md §20's own example, not one coarse
`<resource>.manage`. `GET` routes require `<resource>.read` explicitly; Server Component pages
call the identical `requirePermission` check via `src/app/_shared/has-permission.ts` (shared
across `/organization`, `/people`, and `/attendance`) so a page can never show data an API route
would refuse.
`Permission` documents also carry
`category` (grouping — now actually used by `/settings/access`'s permission-checkbox editor,
ADR-023) and `isSystem` (reserved) — display metadata only, never read by `authorize()`.

`RoleAssignment.scope` is `{ type: "organization" }` or `{ type: "project", projectIds }`
(ADR-043). `authorize({ …, projectId })` lets a project grant pass only for its own projects; without
a `projectId` only organization-wide grants count. `requireProjectAccess` guards one project;
`requireAccessibleProjects` / `accessibleProjectIds` return `"all"` or the caller's projects for
list endpoints that filter (attendance, projects, payroll runs today). Granting and account
administration compare grants project by project (`missingGrants`). Older assignments without a
scope are organization-wide; an unknown scope type grants nothing. The required §60 matrix is
`tests/server/authorization/project-scope.test.ts`.

## Custom roles & staff accounts (ADR-023)

`Role` gains a `status` (`active|inactive`); `authorize()`'s granting query treats a missing
status as active (permissive for every role seeded before this field existed) so this shipped
without a required migration. `RoleService`/`RoleAssignmentService`
(`src/domains/authorization/`) let HR compose a role from the real, seeded `Permission` catalog
(rejects unknown keys) and assign/revoke it per user — `/settings/access`. Deactivating a role
stops granting access to everyone holding it immediately; revoking an assignment closes it via
`effectiveTo`, never a delete. `StaffAccountService` (`src/domains/identity/`) creates a plain
HR-shell login (`Person`+`User`, no `employeeId`) — distinct from `EmployeeAccountService`'s
self-service account, since `(app)/layout.tsx` routes purely on `User.employeeId` regardless of
permissions, so a self-service account can never reach the HR shell no matter what role it holds.

## MongoDB modeling (ADR-002)

Collections: `organizations`, `people`, `users`, `permissions`, `roles`, `roleAssignments`,
`auditLogs`, `organizationUnits`, `positions`, `locations`, `projects`, `employees`,
`employments`, `employeeAssignments`, `attendancePolicies`, `attendanceRecords`.

- `Role.permissionKeys: string[]` is embedded rather than a `rolePermissions` join collection —
  a role's permission set is small, bounded, and always read together with the role.
- `RoleAssignment` references `User`, `Role`, `Organization` by id — assignments have an
  independent lifecycle (effective-dated, revocable) from all three.
- `AuditLog` is append-only: no update/delete API is exposed over it anywhere in the codebase.
- `OrganizationUnit.parentUnitId` references itself (unbounded hierarchy depth, independent
  lifecycle per node) rather than embedding children — a unit's descendants are queried
  independently of the unit itself, and cardinality is unbounded.
- `Employment` and `EmployeeAssignment` both reference `Employee` by id rather than embedding —
  both are unbounded, independently-queried histories (see ADR-005/ADR-006), not data owned
  exclusively by one `Employee` document.

Indexes (all justified by an actual query above): `organizations.slug` (unique),
`users.username` (unique, sparse), `users.email` (unique, sparse), `roles.organizationId+name`
(unique), `people.organizationId`, `roleAssignments.userId+organizationId`,
`roleAssignments.roleId`, `auditLogs.organizationId+timestamp`,
`auditLogs.organizationId+resourceType+resourceId`,
`organizationUnits.organizationId+code` (unique), `organizationUnits.parentUnitId`,
`positions.organizationId+code` (unique),
`locations.organizationId+code` (unique), `projects.organizationId+code` (unique),
`projects.locationId`, `employees.organizationId+employeeNumber` (unique),
`employments.employeeId+effectiveFrom`, `employeeAssignments.employeeId+effectiveFrom`,
`employeeAssignments.reportsToEmployeeId`, `attendancePolicies.organizationId+projectId`,
`attendanceRecords.organizationId+employeeId+date` (unique),
`attendanceRecords.organizationId+date`; and from ADR-044: `employeeAssignments.organizationId+effectiveFrom`,
`auditLogs.resourceType+resourceId+timestamp`, `auditLogs.organizationId+actorUserId+timestamp`,
`employees.organizationId`, `leaveRequests.organizationId+startDate`,
`compensations.organizationId+effectiveFrom`, `roleAssignments.organizationId+createdAt`.

**Production builds no indexes at runtime** (ADR-044): run `npx tsx scripts/sync-indexes.ts`
against the production `MONGODB_URI` after a deploy that adds or changes an index. It only creates
indexes and lists ones the schemas no longer declare. The connection pool is 5 per instance
(`MONGODB_MAX_POOL_SIZE`), closing idle connections after 10 seconds.

## Audit (part of ADR-007's server-side trust boundary)

`AuditService.record(...)` is the only write path onto `AuditLog`. Every mutation calls it, per
AGENTS.md §35. Security events about accounts (sign-ins, failures, locks, password and two-step
changes) go through `auditUserEvent` (`src/domains/identity/user-audit.ts`), which files them
under the account's organization.

`AuditQueryService` (`src/server/audit/audit-query-service.ts`) is the read side. It serves
Settings › Audit log (`audit-logs.read`), which has filters by area and date, paging and a detail
panel, and each person's own recent activity on their Security page. Nothing can edit or delete an
entry.

## Sign-in security (ADR-030)

- **Sign-in flow:** one tested function, `signInWithPassword` (`src/domains/identity/sign-in.ts`).
  In order, it checks:
  1. a per-network attempt limit, kept in MongoDB (`LoginThrottle`, 30 attempts per 15 minutes)
     so it holds across restarts and instances;
  2. the password (argon2, with the same timing for unknown accounts);
  3. the account lock (5 wrong passwords or codes lock it for 15 minutes);
  4. the second step when two-step verification is on.

  NextAuth's `authorize` only calls it. Every outcome is audited.
- **Two-step verification:**
  - TOTP per RFC 6238 (`src/server/auth/totp.ts`), tested against the RFC's vectors;
  - replay-protected;
  - secrets are AES-256-GCM encrypted at rest (`secret-box.ts`), keyed by `MFA_ENCRYPTION_KEY` or
    derived from `NEXTAUTH_SECRET`;
  - ten one-time recovery codes, stored as hashes.

  People manage it on their Security page (`/account/security`, from the account menu).
  Administrators can reset it.
- **Passwords:**
  - NIST 800-63B rules (`password-policy.ts`): at least 12 characters, a common-password list, and
    not built from the username;
  - accounts an administrator creates or resets get a temporary password and must choose their
    own at next sign-in (`/change-password`, enforced in both layouts).
- **Accounts:** Settings › Accounts (`users.read`, `users.update`) lists every account's security
  state. From there an administrator can reset a password, unlock, disable or enable an account,
  or reset two-step verification. Disabling or resetting ends the account's session.
- **CSRF:** `src/proxy.ts` (Next.js 16's middleware) refuses data-changing `/api/*` requests whose
  Origin, or Referer, isn't the app itself. This sits on top of the SameSite=Lax session cookie.
  NextAuth's own routes and the CRON_SECRET-protected cron route are exempt.
- **Client IP:** comes from `X-Forwarded-For`, so production must sit behind a proxy that
  overwrites that header. Otherwise the network limit and the audit trail's IPs can be spoofed.

## Auth.js session strategy (ADR-010)

JWT session strategy. The token carries only `userId` — no role or permission is cached in the
token, so authorization is always re-resolved from `RoleAssignment`/`Role` at request time and a
revoked assignment takes effect immediately rather than waiting for the token to expire.
Single-active-session and idle-timeout enforcement (`src/server/auth/session-policy.ts`,
`ConcurrentSessionGuard`) are layered on top — see ADR-010's later section for the mechanism.

## UI standards (mobile-first, AGENTS.md §23/§41)

- **Tables:** `DataTable` columns take `mobile: "title" | "subtitle" | "badge" | "meta" | "actions" |
  "hidden"`; below `md` each row becomes a stacked card from the same markup.
- **Touch targets:** buttons and inputs keep their desktop size and get a 40px minimum height on
  phones (`max-md:min-h-10`); override with a className, not extra `md:` heights.
- **Viewport:** `h-dvh` / `min-h-dvh` plus `env(safe-area-inset-bottom)` padding, never `h-screen`.
- **Navigation:** each nav item declares the permission its page checks (a test enforces the match);
  hiding is a convenience only. A page the viewer can't open renders `<NoAccessState permission=… />`,
  which names the missing access and the viewer's roles and offers a copyable request.
- **Detail pages:** phones get a back link in the top bar from the nav structure; `[id]` routes add a
  `loading.tsx` with `PageLoader variant="detail"`.
- **Forms:** `FormField error/description` wires `aria-invalid` / `aria-describedby`;
  `useFieldErrors` maps an API `{ error, field }` onto the field. `FormError` is for errors that
  aren't about one field.
- **Destructive actions** go through `ConfirmDialog`; its `onConfirm` throws on failure so the reason
  stays in the dialog.
- **Display rules** (ADR-045): instants via `formatDateTime` (Manila time), calendar dates via
  `formatCalendarDate`, money via `formatMoney`.

## Known gaps (tracked, not silently ignored)

- **Biometric devices:** any signed-in self-service session may register another device for
  clock-in; requiring HR approval for a second device is a product decision still open.
- **Holidays don't drive pay or attendance yet.** The calendar is reference data on Schedules;
  payroll still takes holiday pay as an adjustment and leave counts calendar days. Holidays also
  share `attendance.read`/`attendance.update` instead of their own `holidays.*` permissions.
- **Eid'l Fitr and future years' proclamations** aren't built in: the Philippine preset flags
  years it hasn't verified, and HR adds proclaimed days by hand.

- **Two-step verification can be required for HR and admin accounts** (ADR-039), not per role.
- **Project scope covers attendance, projects and payroll runs** (ADR-043). Other modules use
  organization-wide checks, so a project-scoped holder is refused there rather than over-granted.
- **Catalog flags** (`isClosed`, `isHired`) can only be set through the catalog API for now
  (ADR-045); the catalog editor doesn't show metadata flags yet.
- **Concurrency tests need a real replica set.** `tests/security/races-2026-10.test.ts` has
  stale-read tests that run anywhere and concurrent ones that run where transactions work (the
  Vitest in-memory replica set and CI).
- `lastActivityAt` idle tracking lives in the JWT, not rewritten to the database on every
  request — avoids write-amplification, at the cost of trusting the (signed, tamper-proof)
  token's own timestamp rather than a server-side clock.
- No admin UI exists to revoke a single `WebAuthnCredential` (e.g. a lost phone) — see ADR-020's
  consequences. HR resetting a self-service account's password does not touch its registered
  credentials today.
