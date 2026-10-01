---
name: security-checklist
description: EychAr's security review checklist, built from the October 2026 audit (ADR-037). Run over every feature or change before calling it done, and whenever touching auth, sessions, permissions, roles, accounts, payroll, files, exports or anything cross-organization.
---

# Security checklist (EychAr)

Go through every line that applies; each item is a real bug class found in this codebase before (ADR-037). Report what you checked.

## Tenancy and authorization
- [ ] Every query on org data filters by `organizationId`; loads are `findOne({ _id, organizationId })`.
- [ ] Every client-supplied foreign id is checked with `assertInOrganization` before being written (employee, project, leave type, role, rule version, …).
- [ ] Lookups by `employeeId`/`userId` alone (compensation, accounts, assignments) also filter by `organizationId`.
- [ ] Route uses `requirePermission` with the right action; writes never use `.read`.
- [ ] Granting roles/permissions: the target already belongs to the org, and the actor can't grant permissions they don't hold (`RoleAssignmentService.assertCanGrant`).
- [ ] Acting on another user's account (reset, unlock, disable, delete, hide): refused if they're a Super Admin anywhere or tied to another organization (`assertCanAdminister`).
- [ ] Super-Admin-only behaviour is enforced in the service.
- [ ] Self-service routes take the employee from the session (`requireSelfServiceEmployee`), never the body.

## Sessions and identity
- [ ] New API routes go through `requireAuthenticatedUser` (directly or via `requirePermission`), so a pending temporary password is refused.
- [ ] Anything that changes credentials ends other sessions (clear `activeSessionId`).
- [ ] No identity secrets in responses or logs (`passwordHash`, MFA secret/recovery codes, WebAuthn challenges, session ids).
- [ ] Sign-in-like endpoints are throttled and don't reveal whether an account exists.

## Input, files, output
- [ ] zod at the boundary; ids `objectId()`; text and arrays bounded.
- [ ] No user input in `$regex` without escaping; no request objects passed straight into Mongo filters.
- [ ] Uploads via `inspectDocumentUpload` (allow-list + magic bytes + server-measured size); downloads use `safeDownloadType`.
- [ ] CSV via `buildCsvContent` (formula-neutralised); no exceljs formula cells built from user data.
- [ ] No `dangerouslySetInnerHTML` with user data; no `href` built from user input without a safe scheme.
- [ ] Exports are audited (`auditExport`) and rate-limited; heavy/bulk actions call `enforceRateLimit`.

## Platform
- [ ] No inline `<script>` without the CSP nonce (`headers().get("x-nonce")`); new third-party script/style/connect hosts must be added to `src/server/security/csp.ts` deliberately.
- [ ] New secrets/env vars are server-only (not `NEXT_PUBLIC_*`) and documented in `.env.local.example`.
- [ ] Cron/webhook secrets checked with `checkCronAuthorization` (constant time).
- [ ] Errors go through `toErrorResponse`; nothing internal leaks to the client.

## Data safety
- [ ] No hard deletes of business data; history kept (effective dating, `status`).
- [ ] Changes are audited with before/after.
- [ ] Personal data (Philippine Data Privacy Act): collect only what the feature needs, don't send it to third parties, don't log it.

## Tests that must exist for the change
- [ ] Another organization's id is refused.
- [ ] A user without the permission is refused (where permissions are involved).
- [ ] Bad/malformed input returns 400, not 500.
