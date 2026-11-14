# Identity (accounts, sign-in, two-step, biometrics)

**Purpose:** Login accounts and their security: password sign-in with lockout, two-step verification (authenticator app and recovery codes), WebAuthn biometrics for self-service clock-in, password change and administrator reset, account administration, creation of staff and self-service accounts, and per-organization session and two-step settings.
**Governing docs:** ADR-030 (sign-in security, ARCHITECTURE.md § Sign-in security); ADR-039 (two-step required for staff, `docs/architecture/adr/ADR-039-required-two-step-for-staff.md`); ADR-023 (staff accounts, ARCHITECTURE.md § Custom roles & staff accounts); ADR-020 (self-service biometric clock-in); ADR-003 (User, Person, Employee are separate); ADR-010 (Auth.js session strategy, ARCHITECTURE.md § Auth.js session strategy); ADR-037 and ADR-040 (security hardening and second review, ARCHITECTURE.md § Security hardening). ENGINEERING.md §19: authentication ("who is this") and authorization ("what can they do") are separate; permission checks live in `src/server/authorization`, not here.
**Services** (all in `src/domains/identity/`):
- `sign-in.ts`: `signInWithPassword(credentials, {ip, now})`, the full sign-in decision. Called from the NextAuth `authorize` in `src/server/auth/options.ts` (line 73), with `clientIp(req.headers)`.
- `login-guard.ts`: `LoginGuard` with `allowAttempt`, `reserveAttempt`, `releaseAttempt`, `recordUnknownLoginFailure`, `recordFailure`, `recordSuccess`, `unlock`, `isLocked`; `clientIp(headers)`; constants `MAX_FAILED_SIGN_INS = 5`, `LOCK_MINUTES = 15`, `NETWORK_ATTEMPT_LIMIT = 30`.
- `user-lookup.ts`: `findUserByLogin(login)`, username or email, lower-cased, active accounts only.
- `mfa-service.ts`: `MfaService` with `confirmPassword`, `startEnrollment`, `confirmEnrollment` (returns 10 recovery codes), `verifySignIn`, `regenerateRecoveryCodes`, `disable`, `adminReset`.
- `webauthn-service.ts`: `WebAuthnService` with `generateRegistrationOptions`, `verifyRegistration`, `generateAuthenticationOptions`, `verifyAuthentication`, `hasRegisteredCredential`, `resetCredentials`; `WEBAUTHN_CHALLENGE_TTL_MS` (2 minutes).
- `account-security-service.ts`: `AccountSecurityService` with `changePassword`, `resetPassword`, `setStatus`, `unlock`, `resetMfa`, `rename`, `listForOrganization`, `requireUserInOrganization`, `assertCanAdminister`.
- `staff-account-service.ts`: `StaffAccountService` with `create` (Person and User, no `employeeId`) and `toSummary`.
- `employee-account-service.ts`: `EmployeeAccountService` with `create` (User linked to an employee, plus the "Employee Self-Service" role with no permission keys) and `getForEmployee`.
- `security-settings-service.ts`: `SecuritySettingsService` with `get`, `forUser`, `mustSetUpTwoStep`, `staffWithoutTwoStep`, `update`.
- `user-directory.ts`: `organizationIdsForUser`, `organizationUserIds`, `userBelongsToOrganization`, `userDisplayNames`, `activeRoleAssignment`.
- `user-audit.ts`: `auditUserEvent(userId, action, metadata, actorUserId?)` and `organizationIdForUser`.
- `confirm-password.ts`: `confirmAccountPassword`, rate-limited per user (`passwordCheck`) before the argon2 compare.
- `security-event-labels.ts`: `SECURITY_EVENT_LABELS`, `WARNING_SECURITY_EVENTS`, `describeAuditAction`.

**Models:**
- `src/server/db/models/user.ts` (`User`): `username`, `email`, `passwordHash`, `personId`, `employeeId`, `status`, `failedSignInCount`, `lockedUntil`, `mfa {enabled, secret, pendingSecret, recoveryCodeHashes, lastUsedStep, enabledAt}`, `mustChangePassword`, `activeSessionId`, `webAuthnChallenge*`, `hiddenFromOthers`, `lastSignInAt`. Field names are as the services read and write them.
- `src/server/db/models/login-throttle.ts` (`LoginThrottle`): `key` (unique), `count`, `expiresAt`, with TTL index `expireAfterSeconds: 0`.
- `src/server/db/models/webauthn-credential.ts`: `credentialId` (unique), `publicKey`, `counter`, `transports`, `userId`.
- `src/server/db/models/person.ts`, `employee.ts`, `role-assignment.ts`, `role.ts` (read for organization membership and the Super Administrator role). `organization.ts` holds `security { idleTimeoutSeconds, idleWarningSeconds, requireTwoStepForStaff }`.

**Routes:**
- `src/app/api/auth/[...nextauth]/route.ts`: NextAuth (sign-in calls `signInWithPassword`).
- `src/app/api/account/mfa/route.ts`: `POST` with actions for start, confirm, disable and regenerate (password-gated).
- `src/app/api/account/password/route.ts`: `POST` change password.
- `src/app/api/self-service/webauthn/challenge/route.ts`, `register/options/route.ts`, `register/verify/route.ts`: biometric ceremony for the signed-in self-service user.
- `src/app/api/employee-accounts/route.ts`: `GET` (`employees.read`), `POST` create (`employees.update`).
- `src/app/api/employee-accounts/[id]/webauthn/route.ts`: `DELETE` removes all of an account's biometric credentials (`employees.update`).
- `src/app/api/staff-accounts/route.ts`: `POST` create (`staff-accounts.create`; the service also checks `roles.assign` when a role is given).
- `src/app/api/users/[id]/route.ts`: `PATCH` with rename, reset password, unlock, disable or enable, reset two-step (`users.update`; the route calls `requireUserInOrganization` and `assertCanAdminister` first).
- `src/app/api/settings/security/route.ts`: `PUT` settings (the service checks Super Administrator).
- `src/app/api/organizations/route.ts` lists organizations through `OrganizationService` (see the organization file).

**Pages:**
- `src/app/(app)/account/security/page.tsx`, `mfa-panel.tsx`, `password-section.tsx`.
- `src/app/(app)/settings/accounts/page.tsx`, `account-actions.tsx`.
- `src/app/(app)/settings/security/page.tsx`, `security-settings-form.tsx`, `two-step-requirement-form.tsx`.
- `src/app/(app)/settings/audit/page.tsx`, `audit-entry-sheet.tsx` (labels from `security-event-labels.ts`).
- `src/app/(app)/settings/access/create-staff-account-dialog.tsx`.
- `src/app/(app)/people/[id]/create-employee-account-dialog.tsx`, `reset-biometric-button.tsx` (calls `DELETE /api/employee-accounts/[id]/webauthn`).

**Tests:**
- `tests/domains/identity/`: `sign-in.test.ts` (7), `sign-in-hardening.test.ts` (8), `login-guard.test.ts` (4), `mfa-service.test.ts` (5), `webauthn-service.test.ts` (8), `webauthn-challenge.test.ts` (4), `account-security-service.test.ts` (11), `account-takeover-guards.test.ts` (10), `employee-account-service.test.ts` (6), `staff-account-service.test.ts` (3), `security-settings-service.test.ts` (5), `security-event-labels.test.ts` (2), `user-lookup.test.ts` (5).
- `tests/app/mfa-panel.test.tsx`, `change-password-form.test.tsx`, `account-actions.test.tsx`, `login-page.test.tsx`.
- `tests/server/auth/auth-options.test.ts`; `tests/security/races-2026-10.test.ts` and `scan-2026-10.test.ts` (concurrency and sign-in scans, per ARCHITECTURE.md § Known gaps the concurrent ones need a replica set).

**Rules a change must respect:**
- Sign-in runs in this order (`sign-in.ts` header comment): network limit, then reserve an account attempt before argon2, then password, then lock, then the second step. The reservation happens before the hash, so parallel guesses can't pass the lock.
- Unknown logins take the same path. They use the dummy hash for timing and count against a per-login window (`recordUnknownLoginFailure`), so "locked" never confirms a username exists.
- A correct password without the code yet releases the reserved attempt, because it is not a guess (`releaseAttempt`, `sign-in.ts`).
- A success clears the failure count and any lock (`recordSuccess`). Five failures lock the account for 15 minutes (`recordFailure`).
- TOTP codes are accepted once: `verifySignIn` updates `mfa.lastUsedStep` conditionally. Recovery codes are spent with a conditional `$pull`. Both writes are conditional, so two parallel sign-ins cannot both use one code.
- Starting or confirming enrollment is refused when two-step is already on (`ALREADY_ON`). Turning it off needs the password.
- A staff account cannot turn off two-step while `requireTwoStepForStaff` is on (`mfa-service.ts` `disable`). Turning the requirement on needs the acting Super Administrator to have two-step on (`security-settings-service.ts` `update`).
- An administrator acts on another account only through `assertCanAdminister`: never a Super Administrator's account (unless the actor is that user), never an account in another organization, and only if the actor holds every grant the target holds (`missingGrants`). `MfaService.adminReset` itself has no check, so callers must go through `AccountSecurityService.resetMfa`.
- Password change, disable and admin reset end sessions by unsetting `activeSessionId`. Reset also sets `mustChangePassword` and clears `lockedUntil`. The temporary password alphabet excludes look-alike characters (`account-security-service.ts`).
- WebAuthn challenges are consumed on every verification attempt, pass or fail (`consumeChallenge`). They expire after 2 minutes. The relying party comes from `NEXTAUTH_URL`, so credentials are bound to one origin.
- A self-service account needs an employee in the organization, and each employee has at most one (`EmployeeAccountService.create`). A staff account has no `employeeId` (`StaffAccountService.create`).
- Every security event is audited through `auditUserEvent`. An account with neither an employee nor a role has no organization, so its events are dropped silently (`user-audit.ts`).
- Account security actions take the organization from `organizationIdForUser` (employee's organization, or the first role's). Keep that rule when adding events.

**Known gaps / mismatches:**
- `StaffAccountService.create` creates the `Person` before the `User`. A duplicate username then throws `ConflictError` with an orphaned `Person` left behind. No transaction covers the two writes.
- `EmployeeAccountService.create` creates the `User`, then the role assignment, with no transaction. A failure in the second step leaves a user with no role.
- `WebAuthnService.verifyRegistration(userId, organizationId, response)` stores the `organizationId` it is given without checking it against the user's organization. Its only caller (`src/app/api/self-service/webauthn/register/verify/route.ts`) takes both values from `requireSelfServiceEmployee()`, so the risk depends on that helper staying session-derived.
- `MfaService.adminReset` has no authorization of its own (see Rules). Its only caller checks first, which is correct today but easy to bypass.
- ARCHITECTURE.md § Known gaps says there is no admin UI to revoke one `WebAuthnCredential`. Code agrees: `resetCredentials` removes all of an account's credentials, not one (`employee-accounts/[id]/webauthn`).
- ARCHITECTURE.md § Identity model separates `Person` from `Employee`. Staff accounts link to a `Person` (`personId`) and have no `employeeId`. Self-service accounts link to an `Employee` (`employeeId`); `EmployeeAccountService.create` does not set `personId`. `organizationIdsForUser` checks both links.
- `SecuritySettingsService.forUser` returns the defaults for an account that has no employee or role (`security-settings-service.ts`). Those defaults do not enforce two-step.

**Last verified:** 6587050
