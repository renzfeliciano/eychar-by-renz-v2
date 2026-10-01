# ADR-042: Stay on next-auth v4

## Status

Accepted (October 2026).

## Context

Moving from next-auth v4 to Auth.js v5 was proposed as housekeeping. Checked before starting:

- next-auth v5 never shipped a stable release; it is still `5.0.0-beta.32` on the `beta` tag.
- next-auth v4 (`4.24.15`, the `latest` tag) is the long-term support line and received the July 2026
  security fixes. This app is already on it.
- Auth.js is in security-only maintenance; its maintainers (now the Better Auth team) point new work
  at Better Auth.

## Decision

Stay on next-auth v4 and keep it patched (`npm update next-auth`). Don't move an HR system's sign-in
to a beta.

Everything server-side asks for the session through `getSession()` (`src/server/auth/session.ts`),
so a future move changes that function, `src/server/auth/options.ts` and the client calls
(`next-auth/react`: `useSession`, `signIn`, `signOut`, `SessionProvider`), not every page and route.

## Consequences

- Revisit if v4 stops getting security fixes, or if a feature we need (SAML, SCIM) only exists
  elsewhere. Better Auth is the likely target then; the session rules to carry over are the idle
  limit, single active session, required two-step for staff, and temporary-password lock
  (ADR-010, ADR-030, ADR-039, ADR-040).
