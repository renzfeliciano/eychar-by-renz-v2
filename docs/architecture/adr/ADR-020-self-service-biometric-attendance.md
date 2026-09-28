# ADR-020: Employee self-service login with WebAuthn + geolocation attendance

## Status

Accepted — partially superseded by ADR-026: geolocation and the photo are no longer best-effort.
Clock-in/out now requires a GPS fix inside the selected project's site radius and a live photo taken
after a face-liveness challenge.

## Context

The user asked that clock-in/out capture biometrics and geolocation — specifically Android
fingerprint / iOS Face ID where available. That rules out a shared-kiosk model: platform
biometrics are tied to a signed-in device session, not a shared terminal, so it requires each
employee to have their own login. Presented with the tradeoffs, the user chose, explicitly:

- **Full employee self-service login**, not a kiosk shared by a supervisor's device.
- **Both** a WebAuthn platform-authenticator confirmation (Face ID/fingerprint/screen lock) **and**
  a webcam photo snapshot on every clock-in/out — not one or the other.
- Real browser geolocation (`navigator.geolocation`) captured at the moment of the event.
- **HR creates the self-service account separately** — not auto-provisioned at hire — so
  onboarding a self-service login stays a deliberate HR action, matching how every other account
  in this system is created today.
- Photos are **stored in MongoDB as base64**, not an object store — acceptable for the current
  scale; revisit if photo volume becomes a real storage-cost or query-performance concern.

## Decision

- **Identity**: `User.employeeId` (new, optional ref) marks an account as self-service. A single
  zero-`permissionKeys` "Employee Self-Service" `Role`, upserted once per organization
  (`EmployeeAccountService`'s `findOrCreateSelfServiceRole`), is assigned to it purely so
  `OrganizationService.listAccessibleTo()` — the existing plumbing every account relies on to
  resolve "which org am I in" — keeps working unchanged. Self-service routes never call
  `authorize()`/`hasPermission()`: they use a new `requireSelfServiceEmployee()`
  (`src/server/authorization/require.ts`) that resolves the employee strictly from the session's
  own `User.employeeId`, never from a client-supplied id, so one self-service account can never
  act on another's attendance record.
- **Biometric confirmation**: WebAuthn, platform authenticators only
  (`authenticatorAttachment: "platform"`, `userVerification: "required"`), via
  `@simplewebauthn/server` (`src/domains/identity/webauthn-service.ts`). The relying party is
  derived from `NEXTAUTH_URL` (`rpID` = hostname, `origin` = full URL) rather than hardcoded, so
  it tracks whatever host the app is actually deployed on. The challenge is stored ephemerally on
  `User.webAuthnChallenge` and always cleared in a `finally` block, win or lose, so a failed
  ceremony can't leave a stale challenge blocking the next attempt.
- **Attendance is gated on a fresh, server-verified assertion, not merely present** — both
  `SelfServiceAttendanceService.checkIn()` and `.checkOut()` call
  `WebAuthnService.verifyAuthentication()` first and let it throw before touching the attendance
  record. Geolocation and the webcam photo are best-effort metadata captured client-side
  (`clock-panel.tsx`'s `getLocation()`/`capturePhoto()` both resolve `undefined` on denial or
  failure rather than blocking the flow) — only the biometric check is a hard precondition. That
  asymmetry is deliberate: a missing photo or GPS fix is an environment limitation, but a missing
  or failed biometric means the request isn't verifiably from the enrolled employee's own device.
- **Data shape**: `AttendanceRecord` gains `checkIn`/`checkOut` sub-documents
  (`{at, latitude?, longitude?, accuracy?, photo?, verified}`) alongside the pre-existing plain
  `checkInAt`/`checkOutAt`, which HR's own proxy-recording flow (`AttendanceService`) keeps using
  unchanged — self-service and HR-recorded attendance share one collection and one `computeStatus`
  (present/late) rule, they just populate different fields.
- **Account creation**: `EmployeeAccountService.create()` — HR-only (gated by the existing
  `employees.update` permission key on `/api/employee-accounts`, reused rather than adding a new
  key since this is fundamentally an update to an existing employee record, not a new resource
  type), invoked from a dialog on the employee detail page. Username defaults to the lowercased
  employee number; the temporary password is shown once, in plain text, for HR to hand to the
  employee — there is no self-service "sign up" path.
- **Routing**: `(app)/layout.tsx` redirects any session whose `User.employeeId` is set straight to
  `/clock`, before the HR-shell org lookup runs — a self-service account never sees the HR
  sidebar. A new `(self-service)` route group provides its own minimal layout
  (`SelfServiceHeader` + centered content, no sidebar).

## Consequences

- WebAuthn credentials are bound to one relying party origin. Changing `NEXTAUTH_URL` (e.g.
  moving to a new domain) invalidates every previously-registered credential; employees would
  need to re-register their biometric on that device. This is inherent to the WebAuthn spec, not
  something this app can work around.
- Storing photos as base64 in MongoDB means document size grows with attendance history; if this
  becomes a real concern the fix is swapping `checkIn.photo`/`checkOut.photo` to a storage
  reference without changing the API surface — deferred until it's an actual problem, per the
  user's explicit call to keep it simple for now.
- No admin UI exists yet to revoke a specific WebAuthn credential (e.g. a lost phone) — today the
  only recovery path is HR resetting the self-service account's password, which doesn't touch
  registered credentials. Worth a follow-up if lost-device recovery comes up in practice.
