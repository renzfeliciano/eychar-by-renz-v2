# ADR-016: Org-managed catalogs — shared factory, one collection per entity

## Status

Accepted

## Context

The v1 (legacy PCAS-WorkforceHub) app's "Workspace administration" screen exposes Employment
statuses, Attendance statuses, Recruitment stages, Event categories, Case classifications, and
Case statuses as org-managed, addable/deactivatable lookup lists — alongside Positions and
Projects, which this codebase already models correctly as their own dedicated Mongoose
collections (`Position`, `Project`, Phase 2). Employment status and Attendance status, however,
had shipped in Phases 3/5 as hardcoded Mongoose `enum` arrays, and the first draft of
Recruitment stage repeated the same mistake — a real gap against AGENTS.md §30's own listing of
these as org-configurable catalogs.

The first implementation of this fix used a single generic `CatalogItem` collection with a
`catalogType` discriminator field (one model, one service, one API surface for all seven types).
That design was deliberately discarded before shipping: it does not match this codebase's
existing precedent (`LeaveType`, `Position`, `Project` each already have their own collection),
and mixing unrelated entities in one table makes per-entity indexes, future entity-specific
fields, and Mongo-level access patterns harder than they need to be.

## Decision

Each of the seven catalog entities — `EmploymentType`, `EmploymentStatus`, `AttendanceStatus`,
`RecruitmentStage`, `EventCategory`, `CaseClassification`, `CaseStatus` — is its own Mongoose
model and its own MongoDB collection, matching the `LeaveType`/`Position`/`Project` precedent
exactly. What's shared is not data, but *code*:

- `buildSimpleCatalogSchema()` (`src/server/db/models/simple-catalog-schema.ts`) is a schema
  **factory**: each of the seven model files calls it once and registers its own `model(...)`,
  so there are still seven distinct collections, just built from one schema definition instead
  of seven copy-pasted ones. Shape: `{organizationId, code, name, description?, sortOrder,
  metadata (Mixed, default {}), status}`, unique index `{organizationId, code}`.
- `createSimpleCatalogService(CatalogModel, resourceType)`
  (`src/domains/catalog/simple-catalog-service.ts`) is a service **factory**: each of the seven
  one-line service files (`employment-type-service.ts`, etc.) binds it to its own model, so
  `EmploymentTypeService` and `AttendanceStatusService` are still distinct, independently
  testable service objects — the factory just avoids retyping the same create/list/updateStatus/
  getByCode/assertValidCode logic seven times (AGENTS.md §56 restraint).
- `CATALOG_REGISTRY` (`src/domains/catalog/catalog-registry.ts`) maps seven URL-safe slugs to
  `{service, permissionPrefix}`, consumed by exactly two dynamic API route files
  (`/api/catalogs/[type]`, `/api/catalogs/[type]/[id]`) instead of fourteen near-duplicate ones —
  the route layer is shared, the data layer is not.
- `assertValidCode(organizationId, code)` is **permissive when unconfigured**: if an
  organization has zero items in that model, any code is accepted; once at least one item
  exists, the code must match an active one. This is what let Employment (Phase 3) and
  Attendance (Phase 5) be retrofitted onto catalog validation with zero changes to their ~110
  pre-existing tests, none of which seed catalog items in their throwaway fixtures.

Positions and Projects are unaffected — they already had their own collections and stay under
the "Organization" sidebar section, not under Settings > Catalogs.

## Consequences

- Adding an eighth catalog type later means one schema-factory call, one service-factory call,
  one registry entry, and one settings-page section — not a new model class, but still a new
  collection, matching the pattern this codebase already uses for every other entity.
- `EmploymentService.isActiveStatus()` reads `metadata.isActiveHeadcount` from the org's
  configured `EmploymentStatus` item to decide whether the Terminate button should show,
  falling back to the literal `status !== "terminated"` check when unconfigured — the exact
  business-rule-hook use of `metadata` this design was built to support (per the explicit
  instruction that catalogs be "extensible... open for business rule integrations"), without
  building any actual business-rule engine now.
- `AttendanceService.computeStatus()`/`PayrollService.countUnpaidAbsences()` still reference the
  literal codes `"present"/"late"/"absent"/"on_leave"` directly — a real, stable business rule
  (absence reduces pay), not the kind of hardcoded *option list* this ADR fixes. Teaching Payroll
  how to treat the newly-seeded v1-only attendance codes (Restday work, Holiday work, etc.) is a
  genuine future feature, out of scope here.
