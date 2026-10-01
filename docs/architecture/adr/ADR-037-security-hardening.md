# ADR-037: Security hardening (October 2026 review)

## Status

Accepted

## Context

A full review (sign-in and sessions; authorization and tenant isolation; input, files, exports and
platform headers; dependencies) found no injection or XSS holes, but a set of real gaps. Most matter
today with one organization; a few only once a second organization exists. All were fixed together.

## Decision

**Dependencies.** Next.js 16.3.4 → 16.3.8 (critical advisory in `next/og`; not used here, patched anyway).

**Accounts and sessions**
- A temporary password blocks the API too, not just pages: `mustChangePassword` rides in the token
  and `requireAuthenticatedUser` refuses it, except `/api/account/password`.
- Signing out and changing a password end the session on the server (`activeSessionId` cleared),
  so a copied cookie dies. A changed password signs the person in afresh.
- Sessions also end after `SESSION_MAX_HOURS` (default 12) however active.
- A session ended without a sign-in elsewhere (signed out in another tab, password changed, reset by
  an administrator) is reported as "This session was signed out" (`session_ended`), never as
  "signed in elsewhere". A real sign-in elsewhere shows when, which browser, and which site, so
  people can tell it was them (`lastSignInDevice`, `lastSignInHost` on the user).
- Two-step setup can't be restarted while it's on (turn it off first, which needs the password).
- Sign-in attempts are reserved atomically before the password check, so parallel guesses can't
  exceed the lock; unknown usernames lock the same way real ones do (no enumeration); the client IP
  is the platform's (`x-vercel-forwarded-for` on Vercel, else the right-most `X-Forwarded-For` hop
  after `TRUSTED_PROXY_HOPS`).
- WebAuthn challenges are typed and expire after 2 minutes; MFA secrets use a fixed 16-byte GCM tag.
- The User model never serialises `passwordHash`, MFA secrets or WebAuthn challenges.

**Authorization and tenants**
- Roles can only be given to people who already belong to the organization, and a role can only
  carry permissions the giver holds (unless they're that organization's Super Administrator).
  Creating a staff account with a role needs `roles.assign`.
- An account that also belongs to another organization, or is Super Administrator anywhere, can't
  be reset, unlocked, disabled or deleted from this one; deleting a staff account removes only this
  organization's role assignments; hiding needs current membership.
- Every client-supplied foreign id (employee, project, leave type, rule version…) must belong to the
  organization (`assertInOrganization`); pay terms are read and written per organization.
- Every id in request bodies and queries is validated as an ObjectId (400, not 500).
- The employee profile shows documents, leave and assets only with their own read permissions.

**Files, exports and platform**
- Uploads: allow-listed types checked against the file's own bytes, strict base64, size measured on
  the server, ≤5MB; downloads hand back only allowed types.
- CSV cells that a spreadsheet would run as a formula get a leading `'`.
- Exports are audit-logged; exports, payroll generation and bulk changes are rate-limited per user
  (429 with `Retry-After`).
- Pages carry a per-request nonce Content-Security-Policy (`src/proxy.ts`, `src/server/security/csp.ts`):
  no `'unsafe-inline'` scripts. HSTS only in production, `X-Powered-By` off, COOP same-origin.
- Cron secrets are compared in constant time; unexpected errors are logged without document values.
- The first seeded HR account must meet the password policy and change it at first sign-in.

## Consequences

- Every page is rendered per request (the nonce requires it); pages here were already dynamic.
- `mongoose.set("sanitizeFilter")` was considered and not enabled: it would wrap the app's own
  operator filters. Zod typing at the boundary already rejects operator objects.
- Still open (product decisions, not defects): any signed-in self-service session may register an
  additional device for biometric clock-in; a hidden staff account is hidden in every organization.
