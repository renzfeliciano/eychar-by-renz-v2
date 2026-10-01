# ADR-040: Second security review (October 2026)

## Status

Accepted

## Context

A second full review after ADR-037, ADR-038 and ADR-039 covered four areas: sign-in and sessions;
authorization and tenant isolation; input, files and exports; and business logic, races and
configuration. It found no injection, XSS, SSRF or file-serving holes and no secrets in code. Production
dependencies have no known vulnerabilities; the 2 moderate advisories are in Vitest (dev only).
Regression tests for the main fixes: `tests/security/scan-2026-10.test.ts`.

## Decision

**Tenant isolation**
- Employee assignments: moving or reading an employee's assignments now checks that the employee belongs to
  the organization the permission was checked against, and the open-assignment lookup is scoped to it.

**Privilege escalation**
- Creating or editing a role can only add permissions the actor holds (unless Super Administrator), the
  same rule assigning a role already had.
- Administering an account (reset password or two-step, unlock, disable, rename) is refused when the target
  holds any permission the actor doesn't, because a reset hands over the account.
- Turning two-step on now needs the password, so a borrowed session can't put its own phone on an account.
- Usernames are letters, numbers, `.`, `-` and `_` only (no `@`), so one can never match another account's
  email at sign-in.
- The performance cycle page only shows reviews to people with `performance-reviews.read`, like the API.

**Business rules and races**
- Leave: pending days count against the balance when filing, the balance is checked again at approval,
  the decision is a conditional update (only one approval wins), and nobody decides their own leave.
- Payroll runs: every status change is a compare-and-set on the status it was checked against. Recalculate,
  adjustments and submit take a per-run compute lock that can only be taken on a draft (expires after 2
  minutes), so nothing rewrites a run's records once it has left draft. Two runs prepared at once for the
  same period: the one created later is removed.
- Clock-out is a conditional update, so two at once can't both succeed.

**Rate limits** (per user, `src/server/security/rate-limit.ts`): password confirmations 8 per 15 minutes;
document uploads 30, payroll recalculations 60 and bulk previews 60 per 10 minutes; plus the existing ones.

**Input and errors**
- Every free-text field has a length cap (200, 2000 for notes and descriptions) and id arrays are capped.
- Malformed ids or dates answer 400, not 500. Document uploads check sign-in and a declared size before
  reading the body (411 without one). Sort keys are checked as own properties. One log line no longer
  includes raw error contents.

## Known, accepted

- Off Vercel, the per-network sign-in limit relies on a proxy that sets `X-Forwarded-For`
  (`TRUSTED_PROXY_HOPS`); the per-account lock always applies. On Vercel the platform's header is used.
- The "signed in elsewhere" notice shows the browser and site the other sign-in reported; on Vercel the site
  comes from the platform.
- Hidden test data is visible to employee-linked accounts and to a Super Administrator in every organization
  they belong to (ADR-034). Matters only with several organizations; revisit then.
- Payroll self-approval stays allowed but flagged (`selfApproved`, ADR-029).
