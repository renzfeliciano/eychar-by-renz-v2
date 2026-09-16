# ADR-011: Policy resolution (Attendance)

## Status

Accepted

## Context

AGENTS.md §25 requires strongly typed domain policies, not generic JSON. §26 requires explicit
Organization → Project override resolution — not automatically imposed on every domain. §27
requires historical transactions to use whichever policy was applicable *at their own date*,
never today's policy. Attendance (Phase 5) is the first domain in this codebase that needs any
of this.

## Decision

`AttendancePolicy` is a real Mongoose model with typed fields
(`standardStartTime`/`standardEndTime`/`gracePeriodMinutes`/`workDays`), not a generic
`{ type, config: Mixed }` catalog row. `AttendancePolicyService.resolve({ organizationId,
projectId?, effectiveDate })` (`src/domains/attendance/attendance-policy-service.ts`) picks the
most specific active policy effective on that date: project-scoped first, falling back to
org-wide, returning `{ policy, source }` or `null`.

**Update (Phase 6/Leave): the shared shape was extracted.** This ADR originally kept the
resolver Attendance-specific, deferring extraction until a second real caller needed the same
shape (AGENTS.md §56 — no abstraction for a hypothetical future caller). Leave's
`LeavePolicy.resolve()` needed exactly this Organization→Project override plus the same
day-granular effective-dating widening below, so `src/server/policies/resolve-org-project-policy.ts`
now holds the shared `resolveOrgProjectPolicy<T>(model, { organizationId, projectId?,
effectiveDate, extraFilter? })`. Both `AttendancePolicyService.resolve()` and
`LeavePolicyService.resolve()` are thin wrappers: each supplies its own Mongoose model, its own
concrete document type as the generic parameter (so `resolved.policy` stays fully typed instead
of `unknown`), and, for Leave, an `extraFilter: { leaveTypeId }` to scope further within the org.
The two domains still keep their own typed `create`/`updateStatus`/`listCurrent` — only the
resolution query shape is shared, not the whole service.

**Day-granular comparison, not timestamp comparison**: attendance is recorded per calendar day
(`AttendanceRecord.date`, normalized to UTC midnight), but `effectiveFrom`/`effectiveTo` are full
timestamps (`effectiveFrom` defaults to the exact moment a policy is created). Comparing a
midnight-normalized date directly against a same-day-but-later timestamp fails — a policy created
at 3pm today would not resolve for "today" (which looks like this morning at midnight) purely
because of when during the day it happened to be created. `resolve()` therefore widens both sides
to the full calendar day: `effectiveFrom <= endOfDay(effectiveDate)` and `effectiveTo >=
startOfDay(effectiveDate)`. This was caught by the required test suite itself
(`tests/domains/attendance/attendance-service.test.ts`), not discovered later — worth recording
here because the same trap would resurface in any other domain that mixes day-granular business
dates with timestamp-granular effective dating.

**Status computed and stored at record time, with the policy reference kept**: `AttendanceRecord
.status` is computed once, in `AttendanceService.record()`, from whichever policy resolved for
that record's own date — never recomputed later against today's policy. `policyId` records which
policy version produced it, for reproducibility (the same principle AGENTS.md §28 states for
payroll, applied here first since Attendance got there first).

**Adjustments *are* the approval mechanism for this phase**: `AttendanceService.adjust()` is
gated by `attendance.update` and writes a full before/after audit entry — that audit trail is
the record of who corrected what and when, standing in for a separate request/approve workflow
state machine. AGENTS.md §57 lists a real approval workflow (`leaveRequests`) as Phase 6's
explicit pattern; building one for attendance adjustments first would be premature given nothing
here requires multi-party sign-off yet.

## Consequences

- Payroll policies, when built, can reuse `resolveOrgProjectPolicy()` directly if its shape fits,
  or extend it if a third caller reveals a shape it doesn't yet cover — either way, the decision
  is made from two real examples (Attendance, Leave) instead of a guess.
- If a real multi-party approval requirement for attendance corrections emerges later, it slots
  in as a new state machine without needing to change how policies resolve or how status is
  computed — those two concerns are already separate from "who approved this." Leave's own
  approval workflow (ADR-012) is the first domain that actually needed one.
