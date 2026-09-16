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

**This resolver is Attendance-specific**, not a shared `server/policies/resolvePolicy()`
dispatcher across domains — AGENTS.md §38 mentions a `server/policies/` folder, but Attendance is
still the only policy-driven domain in this codebase. A "shared" abstraction with exactly one
caller isn't actually shared, it's just misplaced (AGENTS.md §56). Extract a common shape into
`server/policies/` only when Leave or Payroll need the same Organization→Project (→Employee?)
resolution pattern, and only after seeing what they actually have in common — not before.

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

- Leave and Payroll policies, when built, get their own typed models and their own `resolve()`
  functions following this same shape — copy the pattern, not (yet) a shared function.
- If a real multi-party approval requirement for attendance corrections emerges later, it slots
  in as a new state machine without needing to change how policies resolve or how status is
  computed — those two concerns are already separate from "who approved this."
