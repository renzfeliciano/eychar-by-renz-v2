---
name: new-api-route
description: Required steps for every new or changed API route handler in EychAr (src/app/api/**) — validation, permission, organization ownership, audit, rate limits and tests. Load before writing or editing any route.ts.
---

# New API route (EychAr)

Every route follows: **Authenticate → Validate → Authorize → Execute (domain service) → Audit → Return** (AGENTS.md §36–37). The route only orchestrates; logic lives in `src/domains/<domain>/*-service.ts`.

## Checklist (all required)

1. **Validate with zod first** — schema in `src/shared/validation/<domain>.ts`, never inline ad-hoc parsing.
   - Every id (`organizationId`, `employeeId`, `projectId`, …) uses `objectId()` from `@/shared/validation/object-id` (a bad id is a 400, never a 500). Selects whose "none" sends `""` use `objectIdOrEmpty()`.
   - Every free-text field has a `.max()`; arrays have `.max()`; records/metadata are bounded.
   - Query params: `schema.parse(Object.fromEntries(request.nextUrl.searchParams))`.
2. **Authorize with `requirePermission("<resource>.<action>", organizationId)`** from `@/server/authorization`.
   - Writes use a write permission (`.create`/`.update`), never `.read`. No role-name checks, ever.
   - A new permission key must be added to `BASELINE_PERMISSIONS` in `scripts/seed.ts` (and mention that HR must re-run `npm run db:seed`).
   - Super-Administrator-only actions are checked in the **service** (`SuperAdminService`), not just the UI.
   - Self-service (employee) routes use `requireSelfServiceEmployee()` and take the employee from the session, never from the body.
3. **Organization ownership** — the service loads by `{ _id, organizationId }` (`findOne`, never `findById` for org data), and every client-supplied foreign id is checked with `assertInOrganization(Model, id, organizationId, "Label")` from `@/server/db/assert-in-organization` before it is written.
4. **Audit every change** — `AuditService.record({ organizationId, actorUserId, action: "<resource>.<verb>", resourceType, resourceId, before?, after? })`. Exports call `auditExport(...)`.
5. **Heavy or bulk operations** (exports, generation, bulk updates) call `enforceRateLimit("<name>", userId)` from `@/server/security/rate-limit`; add a new limit to `RATE_LIMITS` if none fits.
6. **Errors** — wrap the handler in `try { … } catch (error) { return toErrorResponse(error); }`. Throw `NotFoundError` / `ConflictError` / `BusinessRuleError` / `ValidationError` from `@/shared/errors`; never return raw Mongo errors or stack traces.
7. **Responses never include secrets** — no `passwordHash`, MFA data, file blobs in list endpoints (`.select("-fileData")`), or other organizations' data. Return a summary object, not the raw document, for identity data.
8. **Deletes** — no hard deletes of business data (AGENTS.md §53): use `status` (cancel/archive) or the recycle bin registry (`src/domains/deletion/deletion-registry.ts`).
9. **Files/exports** — uploads go through `inspectDocumentUpload` (`src/domains/documents/file-check.ts`); CSV through `buildCsvContent` in `src/lib/csv.ts` (formula-safe).

## Tests (required, under `tests/`)

- Domain test for the service (real Mongo via the test setup): happy path, validation failure, **another organization's id is refused** (`NotFoundError`), duplicate/conflict, audit entry written.
- If permissions or Super Admin rules are involved: a test that the wrong user is refused.
- Run `npx tsc --noEmit`, `npm run lint`, `npm test` before calling it done.

## Template

```ts
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ThingService } from "@/domains/things/thing-service";
import { createThingSchema } from "@/shared/validation/things";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function POST(request: NextRequest) {
  try {
    const input = createThingSchema.parse(await request.json());
    const { userId } = await requirePermission("things.create", input.organizationId);
    const thing = await ThingService.create(input, { userId }); // checks ownership + audits inside
    return NextResponse.json({ thing }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```
