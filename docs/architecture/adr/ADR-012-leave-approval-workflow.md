# ADR-012: Leave approval workflow

## Status

Accepted

## Context

AGENTS.md §57 names `leaveRequests` with an approval workflow as a distinct Phase 6 deliverable,
and §20's own example permission set lists `leave.approve` as its own key. Attendance (Phase 5,
ADR-011) deliberately deferred building a real request/approve state machine, using its
adjustment audit trail as a stand-in approval record instead — Leave is the first domain that
actually needs multi-party sign-off: an employee (recorded on their behalf by HR, per the same
scoping decision as Attendance) requests time off, and someone else with authority decides.

## Decision

`LeaveRequest.status` is a real state machine, not a boolean or a free-form string:
`pending` → `approved` | `rejected` (via `LeaveRequestService.decide()`) or `pending` →
`cancelled` (via `LeaveRequestService.cancel()`). Both transitions only fire from `pending` —
deciding or cancelling an already-decided request throws `BusinessRuleError`, so the history of
who requested what and who decided it can never be silently overwritten.

**`leave.approve` is its own permission, distinct from `leave.update`.** `decide()` is gated by
`leave.approve` at the route (`PATCH /api/leave-requests/[id]` with `{ action: "approve" |
"reject" }`); `cancel()` is gated by `leave.update` (`{ action: "cancel" }`). The person who can
withdraw their own pending request is not necessarily the person who can approve someone else's
— folding both into one permission key would force every organization's role design to grant one
capability whenever they need the other, which AGENTS.md §20's own granular example set (naming
`leave.approve` specifically) already rejects.

**Balance consumption is derived at read time, not stored as a running counter.**
`LeaveBalance` stores only `entitledDays` and a manually-audited `adjustmentDays`; it does not
store a `usedDays` field. `LeaveBalanceService.getAvailable()` computes `entitledDays +
adjustmentDays - sum(approved LeaveRequest.totalDays for that employee/leaveType/year)` on every
call. A `pending` or `rejected` or `cancelled` request never counts against the balance — only
`approved` does. This means there is exactly one source of truth for "how many days has this
person actually taken": the `LeaveRequest` rows themselves. A stored counter would need to be
incremented on approval and decremented on a later correction, and any missed update would drift
from reality with no way to detect it; deriving the number instead makes drift structurally
impossible; the cost is one extra query per balance check, which is the correct trade for
correctness on a number that gates whether someone can take time off.

**`create()` checks both balance and overlap before allowing a `pending` request to exist at
all** — it doesn't defer either check to approval time. A request that would exceed the
computed available balance is rejected immediately with `BusinessRuleError`, and a request whose
date range intersects an existing `pending` or `approved` request for the same employee (any
leave type — an employee can't be simultaneously on approved vacation and requesting sick leave
over the same days) is rejected with `ConflictError`. This keeps the `pending` queue always
representing genuinely decidable requests, rather than ones an approver would reject purely on
arithmetic.

**No `Model.findOne` typing regression from reusing `resolveOrgProjectPolicy()`.**
`LeavePolicyService.resolve()` (ADR-011) passes its own `LeavePolicyDoc` type argument explicitly
so `resolved.policy` stays a real Mongoose document type at the call site — the shared resolver
takes `model: Model<any>` internally (Mongoose's real overloaded `findOne` doesn't structurally
match a simplified duck-typed interface), but that `any` never leaks past the resolver's own
boundary because every caller supplies its concrete type as the generic parameter.

## Consequences

- `tests/domains/leave/leave-request-service.test.ts` covers all four transition edges (approve
  from pending, reject from pending with a reason, cancel from pending, and rejecting a second
  decide/cancel attempt on an already-decided request) plus both `create()` guards
  (balance-exceeded, overlap) — this is the test suite that most directly proves AGENTS.md §57's
  approval-workflow requirement, the same way ADR-005's test proves the transfer mechanic.
- `tests/domains/leave/leave-balance-service.test.ts` proves the derived-balance decision
  directly: an approved request reduces `getAvailable()`, a pending or rejected one does not.
- If Payroll later needs its own approval-style workflow, the state-machine shape here
  (`pending` → terminal, gated by a decision-specific permission distinct from the record-owner's
  own update permission) is the pattern to copy — same spirit as ADR-011's policy-resolution
  shape being copied rather than forced into a premature shared abstraction.
