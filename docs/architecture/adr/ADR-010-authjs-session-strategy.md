# ADR-010: Auth.js session strategy

## Status

Accepted

## Context

AGENTS.md §19 requires authentication ("who is this?") to stay strictly separate from
authorization ("what can they do?"). A JWT session is convenient but risks becoming a place to
cache role/permission data that then goes stale until the token expires or is refreshed.

## Decision

Auth.js Credentials provider, `session.strategy = "jwt"`. The JWT (`token.userId`) and the
resulting `session.user.id` carry **only** the authenticated user's id — no role, no permission
keys, no organization list. Every authorization decision re-queries
`RoleAssignment`/`Role` at request time via `authorize()`.

Login itself: credentials are parsed with a Zod schema (`loginSchema`) before they reach a
MongoDB query, which rejects a crafted `{ login: { $ne: null } }` payload instead of letting it
through as a Mongo operator (NoSQL operator injection). Passwords are hashed with **Argon2id**
(the `argon2` package), not bcrypt — OWASP's current recommendation, and password comparison
always runs against a real Argon2 hash (a precomputed dummy hash when no user matches), so
response timing doesn't reveal whether a username/email is registered.

A login identifier can be a **username or an email** (`findUserByLogin`,
`src/domains/identity/user-lookup.ts`) — not every account has both, and this deliberately
matches the login convention already used elsewhere on this team's other HR tooling.

**Single-active-session + idle-timeout enforcement** (added alongside the UI/design pass, ported
from and improved on that same other tooling's approach): `User.activeSessionId` is overwritten
on every successful login, and `User.lastActivityAt` is set then. The decision of whether a
session is still valid is `resolveSessionState()`
(`src/server/auth/session-policy.ts`) — a **pure function** taking the token's session id/last-
activity, the current time, the configured inactivity window (`getInactivityMs()`,
`SESSION_INACTIVITY_MINUTES`), and the current DB row's `activeSessionId`, returning
`{ expired: false }` or `{ expired: true, reason: "idle_timeout" | "concurrent_session" }`. The
`jwt` callback calls it and stores the verdict on the token; the `session` callback turns it into
`session.error`. Unlike the prior tooling's version — where this same logic lived entirely inline
inside the NextAuth callbacks, untested — it is unit-tested directly
(`tests/server/auth/session-policy.test.ts`) with no database or NextAuth mocking required.
`src/components/shared/concurrent-session-guard.tsx` watches `useSession()` (polled every 60s via
`SessionProvider`'s `refetchInterval`, see `src/components/shared/providers.tsx`) and forces an
explained sign-out the moment `session.error` appears, rather than leaving an already-open tab
silently issuing requests against an invalidated session.

## Consequences

- A revoked `RoleAssignment` or edited `Role.permissionKeys` takes effect on the very next
  request, not after the JWT's `maxAge` (8 hours) expires — there is no cached permission snapshot
  to go stale.
- Every authorization check costs a database round trip; acceptable at Phase 1's scale, and
  revisit only if profiling on a later phase shows it matters (no premature caching layer).
- A server-side `getServerSession` call (e.g. the `(app)` layout) redirects to `/login` the
  moment a session is invalidated, before any protected data is even fetched — the strongest
  enforcement point. The client-side guard exists for the weaker case: a tab that was already
  rendered before the invalidation happened and hasn't navigated since.
- `lastActivityAt` is tracked inside the JWT itself, not rewritten to the database on every
  request — avoiding write-amplification on every authenticated request, at the cost of trusting
  the token's own timestamp (acceptable: JWTs are signed, so a client can't move it backwards).
