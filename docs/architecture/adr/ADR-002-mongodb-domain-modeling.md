# ADR-002: MongoDB domain modeling for Phase 1

## Status

Accepted

## Context

AGENTS.md §31 requires an intentional embed-vs-reference decision per collection, justified by
actual access patterns, not a blanket normalize-everything or embed-everything rule.

## Decision

- `Role.permissionKeys: string[]` is **embedded** on `Role`. A role's permission set is small
  (tens of entries at most), bounded, owned by the role, and always read together with it when
  `authorize()` runs. A separate `rolePermissions` join collection would add a query with no
  access-pattern justification.
- `RoleAssignment` **references** `User`, `Role`, and `Organization` by ObjectId. Assignments have
  an independent lifecycle from all three (effective-dated, revocable, queried independently by
  `userId+organizationId` and by `roleId`), so embedding into `User` or `Role` would make either
  document unbounded as assignments accumulate.
- `AuditLog` **references** its actor and resource by id and stores `before`/`after` as opaque
  snapshots (`Schema.Types.Mixed`) rather than typed per-resource shapes, because it must be able
  to log any resource type across every future domain without a schema change per domain.

## Consequences

- Indexes are limited to what Phase 1's actual queries need: `organizations.slug` (unique),
  `users.email` (unique), `roles.organizationId+name` (unique), `people.organizationId`,
  `roleAssignments.userId+organizationId`, `roleAssignments.roleId`,
  `auditLogs.organizationId+timestamp`, `auditLogs.organizationId+resourceType+resourceId`.
- As Phase 2+ introduces `OrganizationUnit`, `Position`, `Project`, and `EmployeeAssignment`, each
  gets its own embed-vs-reference decision here rather than reusing Phase 1's choices by default.
