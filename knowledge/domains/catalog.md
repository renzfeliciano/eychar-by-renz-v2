# Catalog (organization-managed lookup lists)

**Purpose:** Fourteen organization-managed lookup lists (code, name, description, status, sort order, metadata) that replace hardcoded option arrays, plus helpers that read meaning from metadata flags.
**Governing docs:** ADR-016 (catalogs); ADR-045 (configuration over constants; catalog meaning); ARCHITECTURE.md § Catalogs (Phase 8 foundation, ADR-016); ENGINEERING.md § 2 (cited in `catalog-flags.ts`), § 54 (seed data).

**Services:**
- `src/domains/catalog/simple-catalog-service.ts`: `createSimpleCatalogService(model, resourceType)`, the shared CRUD. Returns `create`, `updateStatus`, `update`, `listCurrent`, `getByCode`, `assertValidCode`.
- `src/domains/catalog/catalog-registry.ts`: `CATALOG_REGISTRY` (slug to `{ service, permissionPrefix }`), `CatalogTypeSlug`, `isCatalogTypeSlug` (own-key check, rejects `constructor` and similar).
- Fourteen one-line instances, each `*-service.ts` in `src/domains/catalog/`: employment-type, employment-status, attendance-status, recruitment-stage, event-category, case-classification, case-status, performance-rating, evaluation-type, document-type, clearance-department, separation-type, payment-method, education-level (a person's highest educational attainment; ten starting levels in `education-level-defaults.ts`; `education-level-options.ts` builds the dropdown and display name).
- `src/domains/catalog/complaint-stage-service.ts`: the complaint board columns, added with the Complaints module (ADR-054; see `complaints.md`). The registry also holds education levels, so it now has fifteen entries, not thirteen.
- `src/domains/catalog/catalog-flags.ts`: `catalogFlag`, `codesWithFlag`, `catalogNumber`.

**Models:** `src/server/db/models/`: `employment-type.ts`, `employment-status.ts`, `attendance-status.ts`, `recruitment-stage.ts`, `event-category.ts`, `case-classification.ts`, `case-status.ts`, `performance-rating.ts`, `evaluation-type.ts`, `document-type.ts`, `clearance-department.ts`, `separation-type.ts`, `payment-method.ts`. All built from `simple-catalog-schema.ts`, which adds a unique index on `{ organizationId, code }` (line 27) and `{ organizationId, sortOrder }` (line 28).

**Routes:**
- `src/app/api/catalogs/[type]/route.ts`: GET (`<prefix>.read`), POST (`<prefix>.create`).
- `src/app/api/catalogs/[type]/[id]/route.ts`: PATCH (`<prefix>.update`). Body is either a status change or a name/description change, not both in one branch (lines 16-19).
- Permission keys: `<slug>.create`, `.read`, `.update` (for example `case-statuses.update`), as the registry's `permissionPrefix`.

**Pages:** `src/app/(app)/settings/catalogs/page.tsx` (with `loading.tsx`).

**Tests:** `tests/domains/catalog/catalog-flags.test.ts`, `catalog-registry.test.ts`, `simple-catalog-service.test.ts`. The fourteen per-type services have no test of their own.

**Rules a change must respect:**
- Adding a catalog type takes four pieces: a model built from `buildSimpleCatalogSchema`, a one-line service from `createSimpleCatalogService`, a `CATALOG_REGISTRY` entry (`catalog-registry.ts` lines 23-37), and seeded `<slug>.*` permission keys (`scripts/seed.ts`).
- `code` is the stable identifier and is never changed after creation. Records embed it (for example `AttendanceRecord.status` stores the code). `update()` changes name and description only (`simple-catalog-service.ts` lines 105-111 and 116-120).
- Code is derived from the name when omitted (`slugifyLowerSnake`, line 37). A duplicate maps to `ConflictError` (lines 50-51).
- Validation is permissive while a catalog is empty. Once it has any item, a code must match an active item (`simple-catalog-service.ts` lines 157-168). The first item therefore makes every later write strict.
- Meaning comes from `metadata` flags, never code lists (`catalog-flags.ts` header comment). An explicit boolean on the item wins; legacy codes apply only to codes the platform seeded and only when the flag is unset (`catalogFlag`, lines 12-23; `codesWithFlag` also counts legacy codes that have no item at all, lines 26-37). `catalogNumber` treats an explicit positive number as set and `null`, `false` or `0` as switched off (lines 40-48).
- Items are deactivated, never deleted (`updateStatus`).
- Every method filters by `organizationId`; writes are audited as `<area>.created` / `<area>.updated` with the model name as `resourceType`.

**Known gaps / mismatches:**
- **Metadata is write-once.** `create` stores `metadata` (`simple-catalog-service.ts` line 47), and the request schema accepts it (`src/shared/validation/catalog.ts` line 11). No path updates it: PATCH handles only status or name/description (`catalogs/[type]/[id]/route.ts` lines 16-19; `simple-catalog-service.ts` `update`, `updateStatus`). So `isClosed` (case status), `isHired` (recruitment stage), `isActiveHeadcount` (employment status), `regularizeAfterMonths` (employment type) and similar flags can be set only when the item is created. ARCHITECTURE.md Known gaps says flags "can only be set through the catalog API" (ADR-045), which understates this.
- Consumers of these flags in this repo: `case-summary.ts` (`isClosed`), `current-staff.ts` (`isActiveHeadcount`), `dashboard/page.tsx` (`regularizeAfterMonths` via `catalogNumber`).
- The catalog editor does not display metadata (ARCHITECTURE.md Known gaps).
- Permissive-when-empty means a new organization accepts any code, including typos, until its first item is created. This is intentional (comment at `simple-catalog-service.ts` lines 151-156) but worth knowing.
- Duplicate-code protection depends on the unique index; `create` maps duplicate-key errors, but index creation is a deploy step (`scripts/sync-indexes.ts`), not verified here.

**Last verified:** 6587050.
