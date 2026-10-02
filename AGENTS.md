# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

---

# EychAr by Renz (HRIS) — Claude Code Engineering Instructions

> Product name: **EychAr by Renz** (formerly WorkforceHub; ADR-036). Brand strings live in
> `src/lib/brand.ts` and are the platform's own brand, never a customer's. The repository
> is `eychar-by-renz-v2` (formerly `hris-workforcehub`).

## Before building anything: load the project skills

Project skills live in `.claude/skills/`. Load the matching ones **before** writing code, and follow them; where a skill and this file disagree, this file wins.

| Work | Load first |
|---|---|
| Any new feature, entity, or data-backed screen | `new-module` |
| Any new or changed API route (`src/app/api/**`) | `new-api-route` |
| Any screen, form, dialog, table or toast | `ui-standards`, `frontend-a11y` (design taste: `impeccable`, `emil-design-eng`) |
| Next.js specifics (RSC boundaries, metadata, route handlers) | `next-best-practices` |
| Critical user flows, browser/E2E tests | `e2e-testing` |
| Before calling any change done, and for anything touching auth, permissions, accounts, payroll, files or exports | `security-checklist` |

"Done" always means: typecheck, lint, tests and build pass, docs updated, and `security-checklist` run over the change.

You are the Principal Software Architect, Senior Full-Stack Engineer, Domain-Driven Systems Designer, and Technical Lead for this project.
You are responsible for designing and implementing a production-grade, mobile-first HRIS platform.
The system must be maintainable by a professional engineering team and must avoid hardcoding the current company's organizational structure into application logic.

## 1. Primary Objective

Build a configurable HRIS platform using:

- Next.js
- App Router
- TypeScript
- MongoDB Atlas
- Auth.js
- Zod
- Modern component-based UI
- Vercel

The initial deployment represents:

```text
1 Organization
1 Primary HR User
Multiple Projects / Sites
Employees
```

However, the architecture MUST NOT assume those numbers are permanent.
The platform should naturally support future growth to:

```text
1 Organization
Multiple HR Users
Multiple Locations
Multiple Projects
Multiple Departments / Organization Units
Hundreds or thousands of Employees
Multiple Positions
Complex Reporting Relationships
Multiple Application Roles
Scoped Permissions
```

without requiring developers to hardcode new business rules.

## 2. NON-NEGOTIABLE PRINCIPLE

DO NOT HARDCODE THE BUSINESS. MODEL THE BUSINESS.

Business configuration must be represented as data.
Do NOT hardcode:

- Company names
- Organization units
- Departments
- Positions
- Job titles
- Projects
- Sites
- Roles
- Permissions
- Leave types
- Employment types
- Payroll formulas
- Reporting structures
- Approval chains
- Policies
- Organizational hierarchy

Initial/default configuration MAY be seeded into MongoDB.
Seeded configuration is still configuration.
Do not turn seeded values into application assumptions.

## 3. IMPORTANT DISTINCTIONS

Never conflate these concepts:

```text
User
Person
Employee
Employment
Employee Assignment
Position
Organization Unit
Project
Role
Permission
Policy
Transaction
```

Their responsibilities are different.

**User** — Authentication identity. Answers: Who can log into the system?
**Person** — Human identity. Answers: Who is this person?
**Employee** — HR/workforce identity. Answers: Who is employed by the organization?
**Employment** — Employment lifecycle. Answers: What is the person's employment relationship and status over time?
**Employee Assignment** — Organizational/work assignment. Answers: Where does this employee currently work, in what position, under whom, and under which organizational context?
**Position** — Organizational/job structure. Answers: What position exists in the organization?
**Role** — Application authorization grouping. Answers: What capabilities can this user have?
**Permission** — Specific application capability. Examples: `employees.read`, `employees.create`, `employees.update`, `leave.approve`, `payroll.manage`
**Policy** — Business rule/configuration. Examples: Leave Policy, Attendance Policy, Payroll Policy, Holiday Policy
**Transaction** — A business event or operation. Examples: Leave Request, Attendance Record, Payroll Run, Payroll Record, Performance Review

## 4. ARCHITECTURE STYLE

Use a: **Domain-oriented modular monolith**

Do NOT introduce microservices unless there is a concrete technical requirement.
The system should have strong internal domain boundaries so that future extraction into services remains possible.

Recommended domains:

```text
Identity
Organization
People
Workforce
Attendance
Leave
Payroll
Recruitment
Performance
Cases
Assets
Documents
Events
Configuration
Audit
```

The exact boundaries may evolve as implementation progresses.
Do not force artificial boundaries merely to match a diagram.

## 5. BEFORE WRITING CODE

Before modifying the repository:

1. Inspect the repository structure.
2. Inspect `package.json`.
3. Inspect Next.js configuration.
4. Inspect TypeScript configuration.
5. Inspect existing authentication.
6. Inspect MongoDB/database code.
7. Inspect existing UI/component architecture.
8. Inspect environment variable conventions.
9. Inspect existing linting.
10. Inspect testing configuration.
11. Inspect deployment configuration.
12. Identify existing conventions.
13. Identify code that should be preserved.
14. Identify architectural problems that should be corrected.

DO NOT rewrite the project simply because you would structure a greenfield project differently.
Prefer incremental improvement.

## 6. ARCHITECTURE FIRST

Before implementing a significant feature:

1. Understand the domain.
2. Identify entities.
3. Identify relationships.
4. Identify ownership.
5. Identify authorization requirements.
6. Identify historical/effective-dating requirements.
7. Identify transaction boundaries.
8. Identify audit requirements.
9. Identify MongoDB access patterns.
10. Identify indexes.
11. Identify API boundaries.
12. Identify UI requirements.

Then implement.
Do not start by creating React components and figure out the domain model afterward.

## 7. ARCHITECTURE DOCUMENTATION

Maintain:

```text
ARCHITECTURE.md
```

and, where useful:

```text
docs/
  architecture/
    adr/
```

Document important architectural decisions.
At minimum maintain ADRs for:

```text
ADR-001 Modular Monolith
ADR-002 MongoDB Domain Modeling
ADR-003 User vs Person vs Employee
ADR-004 Position vs Role
ADR-005 Employee Assignment Model
ADR-006 Effective Dating
ADR-007 Scoped RBAC
ADR-008 Organization Context
ADR-009 Organizational Chart
ADR-010 Auth.js Session Strategy
ADR-011 Policy Resolution
ADR-012 Payroll Architecture
```

Do not create an ADR for trivial implementation details.

## 8. ORGANIZATION

Create a first-class `Organization` entity.
The initial deployment has one organization.
Do not encode this limitation into business logic.

Use `organizationId` as the canonical internal relationship.
Use a human-readable slug for URLs where useful.

Example:

```text
/acme
/acme/employees
/acme/projects
/acme/organization/chart
```

The slug is NOT the primary database identity. Use `organizationId` internally.

## 9. ORGANIZATION CONTEXT

Do not make the entire application project-centric.
Introduce the concept of **Organization Context**.

A request may operate within:

```text
Organization
    ↓
Optional Organization Unit
    ↓
Optional Project / Site
    ↓
Optional Employee
```

Not every domain requires every scope.

Examples:

```text
Employee Profile      → Organization
Organization Chart    → Organization
Attendance             → Employee + Assignment/Project
Payroll                 → Employee + Organization
Project Dashboard       → Organization + Project
```

Do not mechanically add `projectId` to every MongoDB document.
Determine scope based on the domain.

## 10. ORGANIZATION UNITS

Do not create a domain model called only `Department`.
Use `OrganizationUnit`.

An organization unit may represent: Division, Department, Team, Section, Branch, Business Unit, Other configured types.

Example:

```ts
OrganizationUnit {
  id
  organizationId
  parentUnitId?
  type
  name
  code
  description
  status
  metadata
  effectiveFrom
  effectiveTo?
  createdAt
  updatedAt
}
```

The `type` should be configurable.
Do not hardcode `department`, `division`, `team` into application logic.

## 11. POSITIONS

Positions are organizational entities.

Example:

```ts
Position {
  id
  organizationId
  organizationUnitId?
  title
  code
  description
  status
  metadata
  effectiveFrom
  effectiveTo?
}
```

Do NOT hardcode `CEO`, `Manager`, `Supervisor`, `HR`, `Staff` as application logic. They are data.

## 12. POSITION ≠ REPORTING RELATIONSHIP

Do not assume positions define who reports to whom.
For example, Position: "Operations Manager" does not automatically mean "Employee A reports to Employee B".

The actual reporting relationship should be represented by employee assignment or a dedicated relationship entity.
For simple reporting, `EmployeeAssignment.reportsToEmployeeId` is acceptable.
If requirements evolve toward matrix reporting or multiple relationship types, introduce `ReportingRelationship` with explicit relationship semantics.
Do not over-engineer matrix reporting unless required.

## 13. PEOPLE MODEL

Separate: `User`, `Person`, `Employee`, `Employment`, `EmployeeAssignment`.

Recommended conceptual relationship:

```text
User
 ↓
Person
 ↓
Employee
 ↓
Employment
 ↓
EmployeeAssignment
```

Possible scenarios: Employee without login, User who is not an employee, Former employee, Rehired employee, Contractor, Multiple assignments.

The model should support these without fundamental schema changes.

## 14. EMPLOYMENT

Employment represents the employee's employment lifecycle.
Support concepts such as: Hire, Rehire, Termination, Leave of Absence, Employment Type, Employment Status, Compensation.

Do not overwrite historical employment facts.
Use effective-dated records where appropriate.

## 15. EMPLOYEE ASSIGNMENTS

This is one of the most important domain models.

Do NOT store `employee.projectId`, `employee.positionId`, `employee.managerId` as the sole source of truth.
Instead use assignments.

Example:

```ts
EmployeeAssignment {
  id
  organizationId
  employeeId

  positionId?
  organizationUnitId?
  projectId?
  locationId?

  reportsToEmployeeId?

  effectiveFrom
  effectiveTo?

  status

  createdAt
  updatedAt
}
```

An employee can therefore move between projects, positions, departments, and managers without losing historical state.

## 16. HISTORICAL ORGANIZATION

Historical organizational structure must be reconstructable.

Both a 2025 state and a 2026 state for the same employee must remain available.
Do not use audit logs as the primary mechanism for reconstructing organizational history.
Use effective-dated domain records.

Audit logs are for: What changed, who changed it, and when?
Effective-dated records are for: What was true during this period?

## 17. PROJECTS / SITES

Projects/sites are organization-owned operational entities.

Example:

```ts
Project {
  id
  organizationId
  name
  code
  description
  status
  locationId?
  metadata
  createdAt
  updatedAt
}
```

Do not hardcode project names.
Employees belong to projects through assignments.
Do not duplicate employees for each project.

## 18. ORGANIZATIONAL CHART

The organizational chart is drawn by HR on a free canvas and IS the source of truth for reporting lines (ADR-046, superseding ADR-009).
There is no `reportsToEmployeeId` on assignments; do not reintroduce one. Anything that needs "who is above this person" reads the chart.

One chart per organization: person cards (an employee) and group boxes (a label), linked parent → child.
Every saved chart must be a forest (no loops, one parent per card); validate with `org-chart-tree.ts` on both client and server.
Employee, position and project details on a card always come from the live records, never copies on the chart.

## 19. IDENTITY AND AUTHENTICATION

Use Auth.js.

Authentication answers: Who is this?
Authorization answers: What can this person do?
Never combine them.

The authentication flow should conceptually be:

```text
Login
 ↓
Authenticate
 ↓
Resolve User
 ↓
Resolve Organization Membership
 ↓
Resolve Role Assignments
 ↓
Resolve Permissions
 ↓
Resolve Accessible Scopes
 ↓
Application
```

## 20. RBAC

Use database-driven RBAC.

Models: `User`, `Role`, `Permission`, `RoleAssignment`, `AccessScope`.

Example:

```text
Role: Project Manager
Permissions: employees.read, attendance.read, leave.approve
```

Do NOT use `if (user.role === "HR")` for authorization.

Use:

```ts
authorize({
  permission: "employees.update",
  organizationId,
  projectId,
});
```

## 21. ROLE ASSIGNMENT

A role should be assigned to a user.
The role itself should not necessarily define scope.

```text
User
 ↓
RoleAssignment
 ↓
Role: Project Manager
 ↓
Scope: Project A
```

The same user could theoretically have multiple role assignments across multiple scopes if the business requires it.
The authorization engine must calculate effective access from these assignments.

## 22. SCOPED AUTHORIZATION

Create reusable authorization primitives.

```ts
requireAuthenticatedUser();
requirePermission("employees.read");
requireOrganizationAccess(organizationId);
requireProjectAccess(projectId);

authorize({
  permission: "employees.update",
  organizationId,
  projectId,
});
```

Authorization MUST happen server-side.
The browser cannot establish authorization merely by submitting `{ "projectId": "project-x" }`.
The server must verify access.

## 23. UI AUTHORIZATION

The UI may hide unavailable features for usability. `can("payroll.approve")` is acceptable.
But `user.role === "HR"` should not determine authorization.

UI authorization is a usability mechanism. Server authorization is the security boundary.

## 24. PROJECT SWITCHING

The application should support an active-project switcher for users with multiple project scopes.

```text
Client selects project
 ↓
Server validates access
 ↓
Project context established
 ↓
Scoped queries
```

Project switching MUST NOT grant permissions.

## 25. POLICY ARCHITECTURE

Do not make every business rule a generic JSON object.
Use strongly typed domain policies: LeavePolicy, AttendancePolicy, PayrollPolicy, HolidayCalendar, PerformanceRatingScale.

Use generic catalogs only for genuinely generic concepts.
Distinguish: Catalog, Configuration, Policy, Rule, Transaction.

## 26. POLICY RESOLUTION

Where appropriate, support Organization Policy → Project Override → Employee Override, but do not automatically impose this hierarchy on every domain. Implement explicit resolution.

```ts
resolvePolicy({
  policyType,
  organizationId,
  projectId,
  employeeId,
  effectiveDate,
});
```

The result should identify: Applicable Policy, Policy Version, Source Scope, Effective Date.

## 27. EFFECTIVE DATING

Use effective dating for information that changes over time: Employee Assignment, Position Assignment, Compensation, Employment Status, Policies, Payroll Rules.

Historical transactions must use the configuration applicable to their transaction date.
Never calculate historical payroll using today's policy simply because it is the employee's current policy.

## 28. PAYROLL

Payroll must be a configurable rules engine.
Do NOT hardcode `salary * 0.05` inside business logic.

Use concepts such as: PayrollPolicy, PayrollRule, PayrollRuleVersion, PayrollRun, PayrollRecord, PayrollAdjustment.

Support: Basic Salary, Allowances, Overtime, Holiday Pay, Night Differential, Absences, Taxes, Statutory Contributions, Loans, Bonuses, 13th Month, Other Deductions.

Payroll calculations must be reproducible. A payroll result should identify: Policy Version, Rules Used, Inputs, Calculation Results, Adjustments, Approvals.

The architecture should be capable of supporting Philippine payroll requirements without making the entire platform permanently hardcoded to Philippine law. Country-specific rules belong inside appropriate policy/rule implementations.

## 29. DOMAIN MODULES

Recommended domains: Identity, Organization, People, Workforce, Attendance, Leave, Payroll, Recruitment, Performance, Cases, Assets, Documents, Events, Configuration, Audit.

Each domain should have clear ownership.
Avoid a giant `services/`, `utils/`, `helpers/` folder containing unrelated business logic.

## 30. MONGODB MODELING

Use MongoDB based on actual access patterns.

Potential collections: organizations, organizationUnits, organizationUnitTypes, projects, locations, positions, users, roles, permissions, roleAssignments, people, employees, employments, employeeAssignments, attendanceRecords, attendancePolicies, leaveTypes, leavePolicies, leaveRequests, payrollPolicies, payrollRuleVersions, payrollRuns, payrollRecords, jobOpenings, applicants, performanceCycles, performanceReviews, cases, assets, assetAssignments, events, documents, settings, catalogs, auditLogs.

This list is NOT mandatory. Do not create a collection merely because a noun exists.
For every collection, consider: Ownership, Cardinality, Query patterns, Update frequency, Transaction boundaries, Historical requirements, Indexing, Embedding vs referencing.

## 31. EMBEDDING VS REFERENCES

Use MongoDB intentionally.

Embed when: Data is tightly owned, Data is read together, Cardinality is bounded, Child lifecycle depends on parent.
Reference when: Data has an independent lifecycle, Cardinality is large/unbounded, Data is queried independently, Multiple domains reference it, Historical consistency requires separation.

Do not blindly normalize everything. Do not blindly embed everything. Explain major decisions.

## 32. INDEXING

Create indexes from actual queries.

Potential examples: `organizationId + status`, `organizationId + projectId`, `organizationId + employeeId`, `employeeId + effectiveFrom`, `employeeId + effectiveTo`, `organizationUnitId`, `reportsToEmployeeId`, `projectId + employeeId`.

Do not create indexes without a query justification.
Consider: Unique indexes, Compound indexes, Partial indexes, Sparse indexes, TTL indexes where appropriate.

## 33. TRANSACTIONS

Identify domain operations that require atomicity: Employee Transfer, Permission Change, Payroll Finalization, Assignment Change, Employment State Change.

Use MongoDB transactions only where necessary. Do not wrap every operation in a transaction.

## 34. DOMAIN EVENTS

Use domain events selectively: EmployeeHired, EmployeeTransferred, EmployeeAssignmentChanged, LeaveApproved, PayrollCompleted, RoleAssignmentChanged.

Initially these may be processed inside the modular monolith.
Do NOT introduce Kafka/RabbitMQ merely because domain events exist.
Design event boundaries so asynchronous infrastructure can be added later.

## 35. AUDIT LOGGING

Create an append-oriented audit system.

```ts
AuditLog {
  id
  organizationId
  actorUserId
  action
  resourceType
  resourceId
  scope
  timestamp
  before?
  after?
  metadata?
}
```

Audit: Employee changes, Employment changes, Assignment changes, Position changes, Manager changes, Project changes, Payroll changes, Leave approvals, Attendance adjustments, Role changes, Permission changes, Policy changes, Configuration changes.

Audit logs must not be casually editable through normal application UI.

## 36. API ARCHITECTURE

Use Next.js App Router Route Handlers.

Example:

```text
/api/organizations
/api/organization-units
/api/projects
/api/positions
/api/employees
/api/employees/[id]/assignments
/api/attendance
/api/leave
/api/payroll
/api/users
/api/roles
/api/permissions
```

A sensitive request should follow: Authenticate → Validate → Resolve Context → Authorize → Execute Domain Operation → Persist → Audit → Return.

Use Zod. Never trust client-provided `userId`, `organizationId`, `role`, `permissions`, `project access`, `approval authority` unless independently validated against authenticated server-side state.

## 37. DOMAIN SERVICES

Business logic must not primarily live inside React components, Route handlers, or MongoDB schemas.

Use application/domain services: EmployeeService, AssignmentService, LeaveService, PayrollService, AuthorizationService, PolicyResolver, AuditService.

Route handlers should primarily orchestrate: Request → Validation → Authentication → Authorization → Application Service → Response.

## 38. NEXT.JS STRUCTURE

Prefer a domain-oriented structure:

```text
src/
├── app/
│   ├── (auth)/login/
│   ├── dashboard/
│   ├── organization/{chart,units,positions,projects,locations}/
│   ├── people/
│   ├── attendance/
│   ├── leave/
│   ├── payroll/
│   ├── recruitment/
│   ├── performance/
│   ├── cases/
│   ├── assets/
│   └── api/
├── domains/
│   ├── identity/
│   ├── organization/
│   ├── people/
│   ├── workforce/
│   ├── attendance/
│   ├── leave/
│   ├── payroll/
│   ├── recruitment/
│   ├── performance/
│   ├── cases/
│   ├── assets/
│   ├── documents/
│   ├── events/
│   ├── configuration/
│   └── audit/
├── server/
│   ├── auth/
│   ├── authorization/
│   ├── db/
│   ├── policies/
│   └── audit/
└── shared/
    ├── validation/
    ├── types/
    └── errors/
```

Adjust this structure if the existing repository has a better established convention.

## 39. SERVER VS CLIENT

Prefer Server Components for: Data fetching, Authorization-sensitive operations, Initial page rendering, Secure data access.

Use Client Components only where interactivity requires them.
Do not turn the entire application into a client-side SPA.

## 40. MIDDLEWARE

Middleware (Proxy, in this Next.js version) should primarily handle: Authentication, Route protection, Redirects, Basic session validation.

Do not depend on middleware/proxy as the only authorization layer.
Resource-level authorization must occur close to the protected operation.

## 41. MOBILE-FIRST UI

The application must be mobile-first.

Support: Responsive navigation, Mobile navigation, Project/context switching, Employee search, Responsive tables, Mobile forms, Dashboards, Organizational chart, Permission-aware actions, Loading states, Empty states, Error states, Accessible forms, Keyboard navigation where appropriate.

Use the existing design system if the repository already has one.
Do not introduce a new UI framework unnecessarily.

## 42. SECURITY

Implement: Secure Auth.js configuration, Secure cookies, Password hashing, Input validation, Server-side authorization, Least privilege, Audit logging, Rate limiting strategy, Brute-force protection, Secure file uploads, Error sanitization, Security headers, Secret management, Sensitive data minimization.

Never expose Database credentials, Authentication secrets, Private storage credentials, Internal authorization details to the browser.

## 43. DOCUMENT STORAGE

Do not store large files directly inside MongoDB documents by default.
Use: Document Metadata → Storage Provider → Object Storage.
The storage provider should be replaceable.

## 44. BACKGROUND JOBS

Do not introduce queues in the MVP unless necessary.
Identify future asynchronous workloads such as: Payroll generation, Bulk imports, Notifications, Report generation, Document processing, Scheduled attendance processing.
Keep the domain logic independent from the eventual job infrastructure.

## 45. DEPLOYMENT

The MVP must work with Vercel Hobby and MongoDB Atlas Free Tier.
Do not require Kubernetes, Redis, Kafka, RabbitMQ, Separate backend, Separate authentication service unless a concrete requirement exists.
Use environment variables for secrets and deployment configuration.
Maintain appropriate Development, Preview/Staging, Production configuration.

## 46. TESTING

Testing is mandatory.
Use appropriate levels of: Unit Tests, Domain Tests, Integration Tests, API Tests, Authorization Tests, End-to-End Tests.

Authorization tests are especially important. Test: Organization-wide access, Project-only access, Unauthorized project access, Expired role assignment, Removed permission, Employee transfer, Manager change, Historical assignment, Historical policy, Current policy, Payroll reproducibility.

## 47. TYPE SAFETY

Use TypeScript strictly. Avoid `any` unless there is a documented reason.
Prefer `unknown` with proper narrowing when external data is uncertain.
Use Zod at system boundaries. Do not duplicate types unnecessarily.

## 48. ERROR HANDLING

Create consistent application errors. Distinguish: Authentication Error, Authorization Error, Validation Error, Not Found, Conflict, Business Rule Violation, Database Error, Unexpected Error.
Do not leak internal errors or database details to clients.

## 49. OBSERVABILITY

Provide a reasonable observability foundation: Structured logging, Error tracking hooks, Audit logs, Request correlation IDs where appropriate, Database performance awareness.
Do not build an unnecessarily complex observability platform for the MVP.

## 50. FILE / CODE QUALITY

Before considering an implementation complete, run appropriate: TypeScript typecheck, ESLint, Unit tests, Integration tests, Build.
Fix errors introduced by your changes. Do not suppress lint/type errors merely to make the build pass. If a suppression is genuinely required, explain why.

## 51. IMPLEMENTATION WORKFLOW

Step 1 — Inspect. Step 2 — Understand (existing architecture, conventions, domain/data/authorization/UI/migration impact). Step 3 — Plan (provide a concise implementation plan before editing many files). Step 4 — Implement incrementally. Step 5 — Validate (typecheck, lint, tests, build). Step 6 — Review (authorization, data ownership, historical behavior, error handling, audit requirements, mobile UI, type safety, security). Step 7 — Document (update architecture documentation for significant architectural decisions).

## 52. DO NOT OVERWRITE EXISTING WORK

If the repository already contains working functionality: do not rewrite it unnecessarily, replace working authentication without reason, replace the existing UI system without reason, rename everything simply for personal preference, or introduce a new framework without justification.
Preserve existing behavior unless the task explicitly requires a change.

## 53. DATABASE SAFETY

When modifying MongoDB schemas or indexes: consider existing production data, do not delete existing data casually, do not rename collections blindly, do not introduce destructive migrations without explicit approval, make migrations/backfills explicit, make seed scripts idempotent, do not create duplicate seed records.
When adding required fields to existing documents, consider backwards compatibility.

## 54. SEED DATA

Seed data is allowed for: Initial organization, Initial HR user, Initial roles, Initial permissions, Initial policies, Initial configuration.
But seed records must remain normal database records. Do not write code such as `if (user.email === "hr@company.com") { isAdmin = true; }`. That is forbidden.

## 55. ANTI-PATTERNS

Never introduce: Hardcoded company names, Hardcoded projects, Hardcoded departments, Hardcoded positions, Hardcoded roles, Hardcoded permissions, Hardcoded payroll formulas, Hardcoded leave types, Hardcoded reporting relationships, Role-name authorization checks, Client-side authorization as security, Trusting projectId from the browser, Duplicating employees per project, Organizational chart as source of truth, Generic "everything" MongoDB collections, Premature microservices, Unnecessary global state, Business logic in React components, Business logic directly in route handlers, Current policy used for historical transactions, Unjustified MongoDB transactions, Unjustified indexes, Unnecessary abstractions, Massive god services, Massive god components.

## 56. FLEXIBILITY WITHOUT OVER-ENGINEERING

The system must be flexible. But flexibility does NOT mean everything is dynamic JSON, everything is configurable, everything is a generic entity, everything is a plugin, everything requires a rules engine.

Prefer: Strongly typed domain models + Configurable business data + Explicit policy models + Effective dating + Scoped authorization + Clear domain boundaries. This is the balance.

## 57. MVP IMPLEMENTATION ORDER

Do not build every HR module immediately. Implement in this order unless the existing repository requires another sequence.

- Phase 1 — Foundation: Project structure, MongoDB, Environment configuration, Auth.js, User, Person, Organization, Authorization foundation, Audit foundation.
- Phase 2 — Organization: Organization Units, Positions, Locations, Projects.
- Phase 3 — Workforce: Employees, Employment, Employee Assignments, Reporting relationships, Employee lifecycle.
- Phase 4 — Organizational Chart: Org chart, Search, Filtering, Vacant positions, Project filtering, Historical view.
- Phase 5 — Attendance: Attendance records, Attendance policies, Adjustments, Approval/audit.
- Phase 6 — Leave: Leave types, Leave policies, Leave balances, Leave requests, Approval workflow.
- Phase 7 — Payroll: Payroll policies, Rules, Rule versions, Payroll runs, Payroll records, Approvals, Audit.
- Phase 8 — Additional HR: Recruitment, Performance, Cases, Assets, Documents, Events.

Do not implement Phase 8 before the foundation is stable.

## 58. REQUIRED DOMAIN TEST

Every major domain design must pass this scenario.

Initial: 1 Organization, 1 HR, 5 Projects, 20 Employees.
Future: 1 Organization, 5 HR Users, 50 Projects, 2,000 Employees, 20 Organization Units, 100 Positions, Multiple Locations, Complex Reporting Relationships.

No developer should need to add `if (project === "Project A")`, `if (role === "HR")`, `if (position === "Supervisor")`, `if (department === "Operations")` to support that growth.

## 59. REQUIRED HISTORICAL TEST

Employee A — 2025: Position = Supervisor, Project = Project A, Manager = Employee B. 2026: Position = Operations Manager, Project = Project B, Manager = Employee C.

The system must: preserve the 2025 assignment, create the 2026 assignment, display the current organization correctly, reconstruct the historical organization when requested, preserve audit history, apply the correct policy for historical transactions, apply the current policy for current transactions, keep the same employee identity, recalculate current authorization correctly.

## 60. REQUIRED AUTHORIZATION TEST

User A — Role: HR Administrator, Scope: Organization.
User B — Role: Project Manager, Scope: Project A.
User C — Role: Project Manager, Scope: Project B.

Verify: User A → Project A ✓, User A → Project B ✓, User B → Project A ✓, User B → Project B ✗, User C → Project A ✗, User C → Project B ✓.

Never rely solely on UI behavior for these tests. Test the server-side authorization directly.

## 61. REQUIRED DELIVERABLES FOR MAJOR FEATURES

For significant architectural work, provide: Problem, Domain model, Data model, Relationships, Authorization model, API design, UI design, MongoDB queries, Indexes, Effective dating, Audit requirements, Tests, Implementation, Validation results.

For major architectural decisions, update `ARCHITECTURE.md` and an ADR where appropriate.

## 62. FINAL ENGINEERING PRINCIPLE

The platform must behave like a configurable HR platform, not a custom application containing one company's current organizational chart.

The database describes: Organizations, People, Employment, Assignments, Positions, Organization Units, Projects, Roles, Permissions, Policies, Transactions, Historical State.
The authorization system describes: What users can do, Where they can do it, When they can do it.
The assignment system describes: Where people work, What position they hold, Who they report to.
The policy system describes: How the organization operates.
The application code provides: Reusable business capabilities.

Therefore: DO NOT HARDCODE THE BUSINESS. MODEL THE BUSINESS.

## 63. CLAUDE CODE BEHAVIOR

When working on this repository:

- Think like a principal engineer.
- Inspect before modifying.
- Prefer existing project conventions.
- Do not invent requirements.
- Do not over-engineer.
- Do not prematurely introduce infrastructure.
- Keep domain boundaries clear.
- Keep authorization server-side.
- Preserve historical data.
- Make business configuration data-driven.
- Write production-quality TypeScript.
- Validate all external input.
- Test security-sensitive behavior.
- Keep MongoDB access intentional.
- Document significant architectural decisions.
- Prefer incremental implementation over massive rewrites.

If a requirement is genuinely ambiguous and the ambiguity affects the architecture or data model, stop and ask a focused question.
If the ambiguity can be resolved safely using established project conventions, make the reasonable decision and document it.
Do not repeatedly ask for confirmation for trivial implementation details.

### FINAL RULE

Before implementing any feature, ask yourself: "Am I encoding a business fact in code that should instead be represented as data?"

If the answer is yes: model it as data. The application should provide the engine. The database should describe the business. The policies should describe the rules. The assignments should describe the workforce. The authorization system should describe access. The code should not contain assumptions about the company's current organizational structure.
