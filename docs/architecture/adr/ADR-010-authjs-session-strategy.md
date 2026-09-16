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

## Consequences

- A revoked `RoleAssignment` or edited `Role.permissionKeys` takes effect on the very next
  request, not after the JWT's `maxAge` (8 hours) expires — there is no cached permission snapshot
  to go stale.
- Every authorization check costs a database round trip; acceptable at Phase 1's scale, and
  revisit only if profiling on a later phase shows it matters (no premature caching layer).
- Client-side `useSession()` / `SessionProvider` are not wired up yet, because no page needs
  client-side session state — the login page calls `signIn()` directly and the dashboard reads
  the session server-side.
