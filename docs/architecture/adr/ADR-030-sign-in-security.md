# ADR-030: Sign-in security hardening

## Status

Accepted (2026-09-28).

## Context

The user asked whether security was "enterprise-grade and client-ready". A review found good
basics:

- argon2 password hashes;
- 8-hour sessions with a 30-minute idle timeout and one active session per account;
- a permission check on every API route;
- validation on every input, an audit trail, and security headers with a CSP.

It also found the gaps a client's security questionnaire asks about first:

- no two-step verification;
- sign-in rate limiting in process memory only, and no account lock;
- no server-side CSRF check;
- an 8-character minimum password;
- no way to change or reset a password, unlock or disable an account;
- no screen to read the audit trail;
- dependency advisories.

## Decision

- **One sign-in function.** `signInWithPassword` decides every sign-in. It checks the network
  limit, then the password, then the account lock, then the second step. The lock is checked after
  the password on purpose: a lock message then never confirms that a guessed password was right.
  Unknown and disabled accounts answer exactly like a wrong password, with the same argon2 cost.
  NextAuth's `authorize` maps its outcomes to error codes the sign-in page explains:
  - `locked`, `rate_limited`, `mfa_required`, `invalid_otp`;
  - a wrong password stays NextAuth's generic `CredentialsSignin`.
- **Brute-force protection:**
  - 5 consecutive wrong passwords or codes lock the account for 15 minutes. An administrator can
    unlock it early.
  - Separately, each network gets 30 attempts per 15 minutes. That's generous because a whole site
    can share one office IP at shift start.
  - The counter lives in a MongoDB collection with a TTL index, so it holds across restarts and
    server instances. This replaces the old in-memory limiter.
- **Two-step verification** uses an authenticator app (TOTP, RFC 6238), not SMS or email. It needs
  no paid gateway, works offline, and is phishing-resistant enough for this threat model.
  - The code is Node's own crypto, tested against the RFC's vectors.
  - Enrollment takes two steps (scan, then prove with a code), so a half-scanned secret can't lock
    anyone out.
  - Secrets are encrypted at rest with AES-256-GCM.
  - Each time step is accepted once, conditionally in the database, so a code can't be replayed.
  - Ten recovery codes are kept only as hashes.
  - It's optional for now. Settings › Accounts shows which HR accounts lack it.
- **Passwords** follow NIST SP 800-63B:
  - at least 12 characters and at most 128;
  - a common-password list checked after stripping trailing digits;
  - not built from the username or email;
  - no forced symbol mixes and no expiry.

  Passwords an administrator chooses (new accounts, resets) are temporary: `mustChangePassword`
  sends the person to `/change-password` before anything else. HR never learns the final password.
- **Account administration:** Settings › Accounts lets an administrator:
  - reset a password (a random temporary one, shown once);
  - unlock an account;
  - disable or enable it (disabling ends the session, and you can't disable yourself);
  - reset two-step verification.

  All actions are confirmed, audited and scoped to the administrator's organization.
- **CSRF:** a Next.js 16 `proxy` rejects any data-changing API request whose Origin, or Referer,
  isn't the app. NextAuth's routes (their own CSRF token) and the cron route (a bearer secret) are
  exempt.
- **Audit visibility:** Settings › Audit log shows the trail with filters and a detail panel. Each
  person's Security page shows their own recent sign-ins and changes.
- **Dependencies:**
  - removed the unused `@auth/mongodb-adapter`;
  - pinned `uuid` ≥ 11.1.1 under ExcelJS with an npm override;
  - deferred the `@simplewebauthn/server` v14 upgrade (see ARCHITECTURE.md, Known gaps).

  One low-severity production advisory remains.

## Consequences

- New permissions: `users.read`, `users.update` and `audit-logs.read`. The seed grants them to HR
  Administrator.
- New user fields hold lock state, last sign-in, password lifecycle and two-step data.
- Production must run behind a proxy that overwrites `X-Forwarded-For`, and should set
  `MFA_ENCRYPTION_KEY` (32 random bytes, base64). Rotating that key invalidates existing two-step
  enrollments.
- The login page's footer now carries an authorized-use notice. It's accurate because every
  sign-in is recorded.
