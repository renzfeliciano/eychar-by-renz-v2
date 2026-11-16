# Self-service attendance upgrade: design and plan

**Date:** 2026-11-16. **Status:** PLAN ONLY, not approved, nothing built. All six projects are planned to task level (Part 2: Project 1; Projects 2-6 below it). **Size:** a programme of six projects, built one at a time, each with its own approval gate.
**Builds on:** ADR-020 (self-service WebAuthn clock-in), ADR-026 (geofence and liveness), ADR-056 (stored day result), [../domains/attendance.md](../domains/attendance.md), [../domains/identity.md](../domains/identity.md), [../domains/dashboard.md](../domains/dashboard.md). Sibling pattern: the attendance policy (`AttendancePolicy`, resolved by organization, project and effective date).

---

# Part 1: Design

## Intent and why

The owner wants the phone-based self-service clock to **replace biometric attendance terminals**, with no hardware. The clock page already does a lot of what a terminal does (GPS fence, live face photo after a liveness challenge, the phone's own biometric through WebAuthn). What a terminal still does better, and what this programme adds, is trust and recovery:

- A punch proves a **phone**, not the **person** (the phone's biometric confirms anyone enrolled on that device; the stored photo is a record, "not itself a biometric match", `attendance-record.ts` comment). Nothing flags a punch that succeeds but looks wrong.
- When a punch fails or is forgotten (dead phone, no signal, forgot to clock out), only HR can fix it, by editing the record.
- GPS alone can be faked, a new phone needs HR to reset the biometric, and there is no offline path.

The owner asked that it be **enterprise-grade and flexible**: configuration as data (ENGINEERING §2, §55), effective-dated and reproducible (§27), audited, permissioned, tested.

## Goals, non-goals, anti-goals

**Goals**
- HR can see and decide on punches that look off, with the rules and their effects configured per organization and project (no thresholds in code).
- Employees can ask for corrections themselves, and HR approves them, audited.
- Stronger proof of presence and identity with software only.
- Every decision and every flag is audited and reproducible later.

**Non-goals**
- Any hardware: no terminals, scanners, badges or beacons.
- Automatic face matching (it brings privacy and accuracy questions); the reference photo is for a human reviewer. Revisit later.
- A free-form rule builder where HR writes arbitrary conditions. New rule types are added in code; each has settings.
- Replacing WebAuthn, the geofence or the liveness check. They stay.
- Employee self-service beyond attendance (payslips, leave): a separate programme.

**Anti-goals**
- A flagged punch that silently vanishes, or silently pays when HR chose to hold it.
- Rewriting what an old punch was judged against when settings change later.
- Holding up honest staff: with no rules configured, behavior is exactly today's.
- Review decisions without an owner, a time or a reason.

## Constraints

- Layering and rules per [../CHANGE_PROTOCOL.md](../CHANGE_PROTOCOL.md) and ENGINEERING §§ 35-37, 52, 55: rules in a domain service, thin routes, scope from the server, every change audited.
- **Behavior preserved when unconfigured:** a policy with no punch-review settings produces no flags, no queue entries and no payroll change.
- Day, time and "today" follow the Manila calendar (`appCalendarDate`, `localDateKey`); calendar days are stored as UTC midnight.
- WebAuthn needs a **server-issued challenge**, so a punch made offline can never carry a verified assertion (see Project 6).
- Existing records have no review data; everything new is optional on the record.

## Approaches considered

For where the review settings live:
- **A. Extend `AttendancePolicy` with a `punchReview` section.** Chosen (assumed; confirm). HR already manages it, it is already resolved by organization, project and effective date, and each record already stores `policyId`, so a punch is judged against, and can be re-read with, the policy it was made under. No second resolver.
- B. A separate "punch review policy" with its own resolver. Cleaner on paper, but two things to manage, resolve and snapshot.
- C. Organization-wide settings only. Simplest, but a site with weak GPS (a basement project) needs its own thresholds, and the existing policy already supports project overrides.

For the order: the review queue first, because every later project (reference photo, site code, offline sync, new device) produces flags that land in it.

## The design, per project

### Project 1: Punch review (flags, queue, decisions)

**Settings** (on `AttendancePolicy.punchReview`, all optional, absent means off). Each rule has an **effect** and its own parameter:

| Rule | Flags a punch when | Parameter |
|---|---|---|
| `newDevice` | the biometric credential used was registered less than N days ago | `days` |
| `sharedDevice` | the same browser (a random device key the app stores on the phone) already punched for a different employee within N days | `days` |
| `lowAccuracy` | the reported GPS accuracy is worse than N metres | `meters` |
| `offSchedule` | the punch is more than N minutes from the scheduled shift start (or policy start when none) | `minutes` |

Effects: **`log`** (record the flag, no review needed), **`review`** (the punch counts; it goes to the queue as pending), **`hold`** (it goes to the queue and does not count, nor pay, until approved). The strongest effect among a punch's flags decides.

**Data:** the clock event gains `deviceKeyHash`; the attendance record gains `review: { status: "pending" | "approved" | "rejected", holding: boolean, flags: [{ rule, event: "check_in" | "check_out", effect, detail }], decidedBy, decidedAt, note }` (absent when nothing needing review). The policy snapshot is the record's existing `policyId`.

**Decisions:** a person with `attendance.review` approves, or rejects with a required note. Approve clears the hold. Reject voids the punch for pay: the day result is recalculated as not worked, with a flag. Decisions are final except through the existing HR adjust, which is audited. Check-out can add flags to a record already approved, which reopens it as pending.

**Screens:** `/attendance/review` queue (default filter pending; columns employee, date, flags, effect, status); a decision dialog showing the flags with their values, the punch photo, distance from the site and the policy used. Dashboard row "N punches to review" (kind `punch-review`) for `attendance.review`. Attendance export gains Review status and Flags columns. Payroll warns for pending, held and rejected days (the pattern of the `day_result_missing` warning in `compute-pay.ts`).

**New:** permission key `attendance.review`; audit actions `attendance.punch_flagged`, `attendance.punch_approved`, `attendance.punch_rejected`.

### Project 2: Reference photo
At setting up the biometric, the employee takes a reference photo (the existing `LivenessCamera`, stored by `AttendancePhotoStorage`). HR approves or rejects it (queue, and the employee's profile). The review dialog shows the approved reference beside the punch photo, so a reviewer can compare. New rule `noReferencePhoto` (effect, no parameter) flags punches by employees without an approved reference. A new photo supersedes the old one, which is kept.

### Project 3: Missed-punch and correction requests
The employee asks from the self-service area: a missed clock-in, a missed clock-out, both, or a wrong time, for a day within the allowed window, with a required reason. A person with `attendance.review` approves or rejects (required note). Approval applies the change through the existing HR flow (`AttendanceService.record` / `adjust`), so day results recompute; the record notes the request. The window is policy data (`punchReview.correctionWindowDays`, default in `ATTENDANCE_TIME_RULE_DEFAULTS`-style constants, never inline). Both queues share one review screen with a type filter.

### Project 4: Site code (six-digit code and QR, both)
A rotating code (an HMAC of a per-site secret and the current time step) that proves presence beyond GPS. **Both ways of using it are built, and the policy chooses which is accepted** (owner, 2026-11-16: "both QR and six-digit code, if possible to be flexible"):
- **Six-digit code:** shown on a screen at the site, typed by the employee at clock-in. Works on every phone, no scanner.
- **QR:** the same screen also shows a QR that carries the site and the same code; the employee scans it with the clock page. The app already makes QR codes (`qrcode` is a dependency); scanning uses the browser's built-in `BarcodeDetector` where it exists, with a small decoder library as the fallback for phones without it (a new dependency, picked and pinned when the project starts).
- **Flexibility:** the policy's `siteCode.accept` is `"code"`, `"qr"` or `"either"` (default `"either"` once site codes are on); `siteCode.stepSeconds` and `siteCode.acceptedSteps` set how fast it rotates and how much clock drift is tolerated. Per site, `requireSiteCode` makes it mandatory; otherwise rule `noSiteCode` (effect) flags punches without a valid code.
- **Who shows it:** HR, from a "Site code" screen for `attendance.review` holders (owner: HR only for now).

### Project 5: Switch device
The employee asks for a device change (a new phone). HR approves, which revokes the old credentials (as the existing reset does) and lets the employee register again; the new credential is "new" for the `newDevice` rule, so early punches on it get reviewed. Audited both ways. The employee sees the request's status on the clock page.

### Project 6: Offline punches (last, riskiest)
The page queues a punch (time on the device, position, photo) when there is no signal, and sends it on reconnect. Because WebAuthn needs a server challenge, **an offline punch is unverified by construction**: it is accepted only within `offlineMaxMinutes` of its claimed time, always recorded as `verified: false`, always flagged `offlineSync` with effect `hold` at minimum, and counted only after HR approves. If review shows this is too weak for the owner, the project is dropped; it is last so the rest stands without it.

## Calls made by the writer (change any)

- Settings extend the attendance policy (Approaches, A). The policy cannot be edited today (`updateStatus` only), so a settings change is a new policy with a new `effectiveFrom`, which also keeps old punches reproducible.
- "Shared device" uses an app-issued random device key in the browser's storage, not WebAuthn (two accounts on one phone have different credentials, so WebAuthn can't tell). It is spoofable by clearing storage; it catches casual sharing, which is the aim.
- One permission, `attendance.review`, covers the flag queue, correction requests and the site code screen. **Reviewers are HR for now** (owner, 2026-11-16); a supervisor role can be added later by granting the key. Project scope on attendance is only partly built (known-gaps, attendance.md), so reviewers see their organization; scope follows when the existing gap is fixed.
- Site code: both the six-digit code and QR, chosen by the policy (`siteCode.accept`).
- "Hold" excludes the day from pay in payroll until approved and warns; "review" pays and warns; "log" does neither.
- Rejecting a punch voids it for pay; it does not delete the record, photo or flags.
- No employee notifications yet (there is no notification channel in the app); status is visible on the clock page instead.

## Decisions and open questions
- **Policy placement:** extend `AttendancePolicy` (Approaches, A). Not objected to by the owner, treated as settled.
- **Site code:** both six-digit code and QR, flexible per policy. Decided 2026-11-16.
- **Who decides:** HR (`attendance.review` holders) for now. Decided 2026-11-16.
- **Open:** which QR-decoder library to use as the fallback is decided when Project 4 starts (new dependency, to be approved then).

## Testing (expectations)
Each project: service and pure-rule tests with the exact boundary (a value exactly at the threshold is not flagged), organization scoping, audit, permission 401/403/404 on routes, UI cards and dialogs, an unconfigured policy changes nothing, and a policy change after a punch leaves the punch as it was judged.

## Knowledge files to update as each project is built
`domains/attendance.md`, `domains/identity.md` (credentials, device change), `domains/dashboard.md`, `domains/payroll.md` (warnings), `reference/data-model.md`, `reference/authorization.md`, `reference/testing.md`, `reference/cross-cutting.md` (storage, if the photo store grows), `known-gaps-and-mismatches.md`, an ADR for the review model (next free ADR number; ADR-063 is the latest), this plan's progress, `knowledge/README.md`, and the "Last verified" line of each.

---

# Part 2: Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Build **one project at a time**; each ends with a review gate and the owner's approval before the next.

**Goal:** Let HR review and decide on suspicious self-service punches under configurable rules, then add reference photos, correction requests, a site code, device switching and offline punches.

**Architecture:** Settings live on `AttendancePolicy.punchReview`. A pure function judges a punch against them; the self-service service stores the flags on the record; a review service and routes decide; payroll and the dashboard read the outcome. Later projects add flags to the same mechanism, or their own small request records.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before route or page code, per `AGENTS.md`), TypeScript, Mongoose, Zod, vitest + Testing Library.

**Spec:** Part 1 of this file.

## Global Constraints

- Work on `main` unless told otherwise; stage files by explicit path; do not commit unless the owner asks (other sessions share the checkout).
- A policy without `punchReview` produces no flags, no `review` field and no payroll change.
- `attendance.review` is the only new permission for Projects 1 and 3 (key, description "Review flagged punches and correction requests", category `attendance`, seeded in `scripts/seed.ts`).
- Effects are exactly `"log" | "review" | "hold"`; rule parameters are positive integers; the strongest effect wins (`hold` over `review` over `log`).
- Calendar days: stored as UTC midnight, keyed by `dateToDateKey`; "today" is Manila (`localDateKey`, `appCalendarDate`).
- Every write audited with before and after; every query filtered by `organizationId`; self-service identity from the session (`requireSelfServiceEmployee`), never the client.
- Never put a threshold, window or default in code outside a named constants file used the way `ATTENDANCE_TIME_RULE_DEFAULTS` is.

## Review Focus (Project 1)

- A value exactly at a threshold (accuracy equal to the limit, minutes equal to the limit) is not flagged (Task 2).
- A check-out that adds a flag to an already-approved record reopens it as pending (Task 3).
- Changing the policy after a punch does not change that punch's flags or status (Tasks 3, 4).
- A held punch pays nothing and warns; approving it makes it pay; rejecting it voids it (Task 5).
- Two employees punching from one browser inside the window flag both punches only per the rule's window, not forever (Tasks 2, 3).

---

## Project 1: Punch review

### Task 1: Policy settings

**Files:**
- Modify: `src/server/db/models/attendance-policy.ts`, `src/shared/validation/attendance.ts` (`createAttendancePolicySchema`), `src/domains/attendance/attendance-policy-service.ts` (`create`), `src/app/(app)/attendance/policies/create-policy-dialog.tsx`
- Create: `src/domains/attendance/punch-review-rules.ts`
- Test: `tests/domains/attendance/punch-review-rules.test.ts`; extend `attendance-policy-service.test.ts`, `tests/app/create-attendance-policy-dialog.test.tsx`

**Interfaces:**
- Produces: `type PunchReviewEffect = "log" | "review" | "hold"`; `type PunchReviewRules = { newDevice?: { effect: PunchReviewEffect; days: number }; sharedDevice?: { effect: PunchReviewEffect; days: number }; lowAccuracy?: { effect: PunchReviewEffect; meters: number }; offSchedule?: { effect: PunchReviewEffect; minutes: number } }`; `punchReviewRulesOf(policy: { punchReview?: PunchReviewRules | null } | null | undefined): PunchReviewRules` (empty object when none); `strongestEffect(effects: PunchReviewEffect[]): PunchReviewEffect | null`; policy model field `punchReview` (optional subdocument, no schema default); schema `punchReviewSchema` inside `createAttendancePolicySchema`.

- [ ] **Step 1: Write failing tests:** `punchReviewRulesOf(null)` and a policy without the field return `{}`; `strongestEffect(["log","hold","review"])` is `"hold"`, `[]` is `null`; the schema accepts each rule with an effect and a positive integer, refuses an unknown effect, `0`, a negative, a fraction and a missing effect; the service stores `punchReview` and an audit entry includes it; the dialog shows a "Punch review" section with an effect select and a number per rule, sends only rules switched on, and sends nothing when all are off.
- [ ] **Step 2: Run** `npx vitest run tests/domains/attendance/punch-review-rules.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the types and helpers, the optional subdocument (`_id: false`), the Zod schema, the service pass-through and the dialog section (copy the existing time-rules fields' layout).
- [ ] **Step 4: Run** the three test files and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Stage** the files.

### Task 2: Judging a punch (pure)

**Files:**
- Create: `src/domains/attendance/punch-review.ts`
- Test: `tests/domains/attendance/punch-review.test.ts`

**Interfaces:**
- Consumes: `PunchReviewRules`, `PunchReviewEffect`, `strongestEffect` (Task 1).
- Produces: `type PunchEvidence = { event: "check_in" | "check_out"; at: Date; accuracyMeters?: number; credentialCreatedAt?: Date; otherEmployeeUsedDeviceWithinDays?: boolean; scheduledStartAt?: Date }`; `type PunchFlag = { rule: "newDevice" | "sharedDevice" | "lowAccuracy" | "offSchedule"; event: "check_in" | "check_out"; effect: PunchReviewEffect; detail: string }`; `evaluatePunch(evidence: PunchEvidence, rules: PunchReviewRules): PunchFlag[]`; `reviewOutcomeOf(flags: PunchFlag[]): { needsReview: boolean; holding: boolean }` (`log`-only flags need no review; `review` or `hold` does; `hold` holds). `otherEmployeeUsedDeviceWithinDays` is computed by the loader (Task 3) using the rule's `days`.

- [ ] **Step 1: Write failing tests (exact boundaries):** no rules gives no flags; `lowAccuracy` flags 51 m against 50 m and not exactly 50 m; `newDevice` flags a credential 2 days old against `days: 3` and not exactly 3 days; `offSchedule` flags 16 minutes against 15 and not 15, early or late, and skips when no scheduled start; `sharedDevice` flags when the loader says so; a rule absent from the settings never flags; every flag carries its event and effect; `reviewOutcomeOf` for `[]`, `log` only, `review`, `hold` and a mix.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** with the thresholds read only from `rules`; detail strings state the measured value and the limit ("accuracy 80 m, limit 50 m"). **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 3: Evidence and flags on the punch

**Files:**
- Modify: `src/server/db/models/attendance-record.ts` (clock event `deviceKeyHash`; record `review`), `src/shared/validation/attendance.ts` (clock event schema: optional `deviceKey`, a UUID-like string max 100), `src/domains/attendance/self-service-attendance-service.ts` (`checkIn`, `checkOut`), `src/app/(self-service)/clock/clock-panel.tsx` (send `deviceKey`)
- Create: `src/domains/attendance/punch-evidence.ts`, `src/lib/device-key.ts`
- Test: extend `tests/domains/attendance/self-service-attendance-service.test.ts`; create `tests/domains/attendance/punch-evidence.test.ts`, `tests/lib/device-key.test.ts`

**Interfaces:**
- Consumes: `evaluatePunch`, `reviewOutcomeOf` (Task 2); `punchReviewRulesOf` (Task 1); `WebAuthnCredentialModel.createdAt`; `ScheduleService.getEntryForDate`.
- Produces: `loadPunchEvidence(input: { organizationId: string; employeeId: string; userId: string; credentialId: string; event; at: Date; accuracyMeters?: number; deviceKey?: string; rules: PunchReviewRules; scheduledStartAt?: Date }): Promise<PunchEvidence>`; `hashDeviceKey(key: string): string` (SHA-256 hex; the raw key is never stored); client `getDeviceKey(): string` in `src/lib/device-key.ts` (creates and keeps a random id in `localStorage`, returns a fresh one without storage when blocked); record `review` as in Part 1.

- [ ] **Step 1: Write failing tests:** with no rules the record has no `review` and the service behaves as before (existing tests stay green); a `review` rule creates `review.status "pending"`, `holding false`, the flag, and an audit `attendance.punch_flagged`; a `hold` rule sets `holding true`; a `log`-only flag stores the flag without `status`; a second employee punching with the same `deviceKey` inside `days` flags that punch (and not outside the window); the raw key is not stored, only its hash; a check-out that adds a flag to an `approved` record sets it back to `pending` and keeps the earlier flags; changing the policy afterwards leaves the stored flags and status untouched; `getDeviceKey` returns the same id twice and survives blocked storage.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** the loader (one query for the shared-device check on `checkIn.deviceKeyHash` / `checkOut.deviceKeyHash` of other employees in the organization within the window; the credential's `createdAt` from the credential used, found through the verified assertion's id), call it inside `checkIn`/`checkOut` after the geofence passes, write `review` in the same create or update as the record, and record the flags in the audit entry. **Step 4: Run** the three test files and `npx vitest run tests/domains/attendance`. Expected: PASS. **Step 5: Stage.**

### Task 4: Review service, routes, permission

**Files:**
- Create: `src/domains/attendance/punch-review-service.ts`, `src/app/api/attendance/review/route.ts`, `src/app/api/attendance/review/[id]/route.ts`
- Modify: `src/shared/validation/attendance.ts` (`decidePunchReviewSchema`), `scripts/seed.ts` (key `attendance.review`), `src/domains/attendance/day-result.ts` (`buildDayResult` accepts `voided?: boolean`)
- Test: `tests/domains/attendance/punch-review-service.test.ts`, `tests/app/api/punch-review-routes.test.ts`; extend `day-result.test.ts`

**Interfaces:**
- Consumes: record `review` (Task 3); `DayResultService` / `buildDayResult`.
- Produces: `PunchReviewService.list(organizationId: string, filter: { status?: "pending" | "approved" | "rejected"; from?: string; to?: string; page?: number }): Promise<{ rows: PunchReviewRow[]; total: number }>`; `PunchReviewService.decide(recordId: string, organizationId: string, input: { decision: "approve" | "reject"; note?: string }, actor: { userId?: string }): Promise<AttendanceRecordRow>` (reject needs a non-empty note; only `pending` can be decided, else `ConflictError`; approve sets `holding: false`; reject sets status `rejected` and recalculates the day with `voided: true`, giving a day flag `punch_rejected` and zero worked minutes); routes `GET /api/attendance/review` (`attendance.review`) and `POST /api/attendance/review/[id]` (`attendance.review`).

- [ ] **Step 1: Write failing tests:** list defaults to pending, filters by status and dates, is organization-scoped; approve clears the hold and audits `attendance.punch_approved`; reject without a note is refused (`ValidationError`), with a note voids the day (zero worked minutes, flag `punch_rejected`) and audits `attendance.punch_rejected`; deciding a non-pending record conflicts; another organization's record is not found; routes answer 401, 403 without `attendance.review`, 400 for a bad id or body, 404 across organizations.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** the files plus `npx vitest run tests/security`. Expected: PASS. **Step 5: Stage.**

### Task 5: Payroll reads the outcome

**Files:**
- Modify: `src/domains/payroll/engine/compute-pay.ts` (and the loader that feeds attendance to it; find it from `day_result_missing`), `src/domains/payroll/` warning labels if they exist
- Test: extend `tests/domains/payroll/` (the engine tests that cover `day_result_missing`)

**Interfaces:**
- Consumes: record `review` and `dayResult` (Tasks 3-4).
- Produces: payroll treats a day with `review.holding === true && review.status === "pending"` as not worked, with warning `punch_held_for_review`; a `rejected` day as not worked, warning `punch_rejected`; a `pending` non-hold day as worked, warning `punch_unreviewed`; approved and unflagged days unchanged.

- [ ] **Step 1: Write failing tests** for each of the four states (pay amounts and warning codes), and that records without `review` produce identical results to before (golden comparison with an existing fixture).
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** with the existing warning pattern. **Step 4: Run** `npx vitest run tests/domains/payroll`. Expected: PASS. **Step 5: Stage.**

### Task 6: Screens, dashboard, export

**Files:**
- Create: `src/app/(app)/attendance/review/page.tsx`, `review-table.tsx`, `punch-review-dialog.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`, `src/domains/dashboard/compliance-risks.ts` (a `punchReviewRisks` row function), `src/domains/attendance/attendance-export.ts`, `src/components/shared/nav-links.tsx`
- Test: `tests/app/punch-review-dialog.test.tsx`, `tests/domains/dashboard/punch-review-risks.test.ts`; extend `attendance-export.test.ts`

**Interfaces:**
- Consumes: `PunchReviewService.list`, `decide` and the routes (Task 4).
- Produces: `PunchReviewDialog({ organizationId, row: PunchReviewRow })` (test ids `punch-review-approve`, `punch-review-reject`, `punch-review-note`); `punchReviewRisks(count: number, todayKey: string): ActionItem[]` (kind `punch-review`, title "N punches to review", href `/attendance/review`, shown only to `attendance.review` holders); export columns "Review status" and "Review flags".

- [ ] **Step 1: Write failing tests:** the dialog shows each flag with its measured value and limit, the punch photo and distance; reject needs a note before sending; approve sends and refreshes; server errors show; `punchReviewRisks` returns nothing for 0 and one row otherwise; the export has the two columns, empty for unflagged records.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** by copying `record-dialog.tsx` and the education card patterns; gate the page on `attendance.review` with `NoAccessState`; gate the dashboard load on the same key. **Step 4: Run** the files and `npm run typecheck`. Expected: PASS. **Step 5: Stage.**

### Task 7: Docs, ADR, verification

- [ ] Update the knowledge files listed in Part 1, add the ADR, update this plan's progress, and the "Last verified" lines.
- [ ] Verify: `npm run typecheck`; `npm run lint`; `(npm run test:ui; npm run test:domains; npm run test:core)`, reporting every failure by name. Expected: all new tests pass and nothing previously green turns red. Then run the final whole-change review before Project 2 starts.

---

## Project 2: Reference photo

**Goal:** an employee's enrolment photo, approved by HR, so a reviewer can compare it with each punch photo.

### Task 2.1: Model and service

**Files:**
- Create: `src/server/db/models/reference-photo.ts`, `src/domains/attendance/reference-photo-service.ts`
- Modify: `src/server/db/models/index.ts`
- Test: `tests/domains/attendance/reference-photo-service.test.ts`

**Interfaces:**
- Consumes: `AttendancePhotoStorage.save/read/remove` (`src/server/storage/attendance-photo-storage.ts`, the same private-blob or inline seam the punch photos use); `AuditService.record`.
- Produces: `ReferencePhotoModel` (`organizationId`, `employeeId`, `photo?`, `photoStorage`, `status: "pending" | "approved" | "rejected" | "superseded"`, `submittedAt`, `decidedBy?`, `decidedAt?`, `note?`; indexes `{ organizationId: 1, employeeId: 1, status: 1 }` and `{ organizationId: 1, status: 1, submittedAt: 1 }`); `ReferencePhotoService.submit(employeeId: string, organizationId: string, dataUrl: string, actor: { userId?: string }): Promise<ReferencePhotoRow>` (a new submission replaces any earlier **pending** one; the approved photo stays current until the new one is approved); `.decide(photoId: string, organizationId: string, input: { decision: "approve" | "reject"; note?: string }, actor): Promise<ReferencePhotoRow>` (approve marks the previously approved photo `superseded`; reject needs a non-empty note; only `pending` can be decided, else `ConflictError`); `.currentApproved(employeeId, organizationId): Promise<ReferencePhotoRow | null>`; `.latestFor(employeeId, organizationId): Promise<ReferencePhotoRow | null>`; `.listPending(organizationId): Promise<ReferencePhotoRow[]>`; `.readImage(photoId, organizationId): Promise<Uint8Array | null>`. Audit actions `reference-photo.submitted`, `.approved`, `.rejected`.

- [ ] **Step 1: Write failing tests:** submit stores pending and audits; a second submit replaces the first pending (the first is removed with its blob), not the approved one; approve makes it current and supersedes the old approved; reject without a note is refused, with a note stores it; deciding a non-pending photo conflicts; `currentApproved` is null until approved; a non-JPEG data URL is refused (`ValidationError`, from `decodeJpegDataUrl`); every method is organization-scoped (another organization's photo reads as not found); `readImage` returns bytes for the right organization only.
- [ ] **Step 2: Run** `npx vitest run tests/domains/attendance/reference-photo-service.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the model and service (claim a decision with a conditional update on `status: "pending"`, as `deletion-service.ts` does for batches, so two reviewers can't both decide).
- [ ] **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 2.2: Routes

**Files:**
- Create: `src/app/api/self-service/reference-photo/route.ts`, `src/app/api/attendance/reference-photos/route.ts`, `src/app/api/attendance/reference-photos/[id]/route.ts`, `src/app/api/attendance/reference-photos/[id]/image/route.ts`
- Modify: `src/shared/validation/attendance.ts` (`submitReferencePhotoSchema`, `decideReferencePhotoSchema`)
- Test: `tests/app/api/reference-photo-routes.test.ts`

**Interfaces:**
- Consumes: `ReferencePhotoService` (Task 2.1); `requireSelfServiceEmployee`; `requirePermission("attendance.review", organizationId)`; the existing file response helper in `src/app/_shared/file-response` for the image.
- Produces: `POST /api/self-service/reference-photo` (body `{ photo: string; liveness: { challenges } }`, same limits as the clock event photo, `MAX_CLOCK_PHOTO_LENGTH`; 201 `{ status }`) and `GET` (the employee's latest status: `{ status: "none" | "pending" | "approved" | "rejected", note? }`); `GET /api/attendance/reference-photos?organizationId=` (pending list); `POST /api/attendance/reference-photos/[id]` (decide); `GET /api/attendance/reference-photos/[id]/image` (JPEG, `Cache-Control: private, no-store`).

- [ ] **Step 1: Write failing route tests:** 401 with no session; the self-service route takes the employee from the session and ignores any employee id in the body; 400 for a missing or oversized photo or a non-JPEG; HR routes 403 without `attendance.review`; 404 across organizations; the image route returns `image/jpeg`, `no-store`, and never serves another organization's photo.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** the schemas and routes (copy the shape of `src/app/api/self-service/attendance/clock-in/route.ts` and the `[id]/webauthn` route). **Step 4: Run** plus `npx vitest run tests/security`. Expected: PASS. **Step 5: Stage.**

### Task 2.3: Capture during biometric set-up

**Files:**
- Create: `src/app/(self-service)/clock/reference-photo-step.tsx`
- Modify: `src/app/(self-service)/clock/clock-panel.tsx`, `src/app/(self-service)/clock/page.tsx`
- Test: `tests/app/reference-photo-step.test.tsx`; extend the clock panel tests if present (`tests/app/` clock-panel)

**Interfaces:**
- Consumes: `LivenessCamera` and `LivenessCapture` (`liveness-camera.tsx`); the routes of Task 2.2.
- Produces: `ReferencePhotoStep({ status: "none" | "pending" | "approved" | "rejected"; note?: string | null })`; the clock page loads `ReferencePhotoService.latestFor` and passes the status into `ClockPanel` (new optional prop `referencePhotoStatus`).

- [ ] **Step 1: Write failing tests:** with status `none` the step offers "Take your reference photo", opens the camera and posts the capture; `pending` shows "Waiting for HR to approve your photo"; `rejected` shows HR's note and offers a retake; `approved` shows nothing; clock-in is **never blocked** by this step (the rule decides, not the screen); server errors show.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** the step (reuse `LivenessCamera`); show it as a card below the biometric set-up card and above the clock card. **Step 4: Run** and `npm run typecheck`. Expected: PASS. **Step 5: Stage.**

### Task 2.4: Rule, review dialog, photos tab

**Files:**
- Modify: `src/domains/attendance/punch-review-rules.ts` (add `noReferencePhoto?: { effect: PunchReviewEffect }`), `src/shared/validation/attendance.ts`, `src/app/(app)/attendance/policies/create-policy-dialog.tsx`, `src/domains/attendance/punch-review.ts` (evidence `hasApprovedReferencePhoto?: boolean`), `src/domains/attendance/punch-evidence.ts`, `src/app/(app)/attendance/review/punch-review-dialog.tsx`, `src/app/(app)/attendance/review/page.tsx`
- Create: `src/app/(app)/attendance/review/reference-photo-dialog.tsx`
- Test: extend `punch-review.test.ts`, `punch-evidence.test.ts`, `punch-review-dialog.test.tsx`; create `tests/app/reference-photo-dialog.test.tsx`

**Interfaces:**
- Consumes: Project 1's `evaluatePunch`, `PunchFlag`; `ReferencePhotoService.currentApproved`, `listPending`.
- Produces: rule `noReferencePhoto` (flags a punch when `hasApprovedReferencePhoto === false`; detail "no approved reference photo"); the punch review dialog gains a reference photo beside the punch photo (via the image route) or "No reference photo"; a "Photos" tab on the review page listing pending reference photos with an approve/reject dialog (`reference-photo-approve`, `reference-photo-reject`, `reference-photo-note`).

- [ ] **Step 1: Write failing tests:** the rule flags when no approved photo and not when there is one; absent from settings never flags; evidence loader sets the boolean; the dialog shows both photos or the empty note; the Photos tab lists pending photos and a reject needs a note.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** the files and `npx vitest run tests/domains/attendance`. Expected: PASS. **Step 5: Stage.**

### Task 2.5: Docs and verification
- [ ] Update the knowledge files in Part 1 for this project; add the project's notes to the ADR; verify `npm run typecheck`, `npm run lint`, `(npm run test:ui; npm run test:domains; npm run test:core)`; run the whole-change review; owner approval before Project 3.

---

## Project 3: Correction requests

**Goal:** an employee asks to fix a missed or wrong punch; HR approves and the record is corrected through the existing HR flow.

### Task 3.1: Settings, model and service

**Files:**
- Create: `src/server/db/models/punch-correction-request.ts`, `src/domains/attendance/punch-correction-service.ts`
- Modify: `src/server/db/models/index.ts`, `src/server/db/models/attendance-policy.ts` (`punchReview.correctionWindowDays`), `src/shared/validation/attendance.ts`, `src/domains/attendance/punch-review-rules.ts` (constant `PUNCH_CORRECTION_DEFAULTS = { windowDays: 7 }` and `correctionWindowDaysOf(policy)`), `create-policy-dialog.tsx`
- Test: `tests/domains/attendance/punch-correction-service.test.ts`; extend `punch-review-rules.test.ts`

**Interfaces:**
- Consumes: `AttendanceService.record(input, actor)` and `adjust(id, organizationId, patch, actor)` (`attendance-service.ts` lines 106 and 173); `AttendancePolicyService.resolve`; `EmployeeAssignmentService.getAsOf`; `appCalendarDate`, `localDateKey`.
- Produces: `PunchCorrectionRequestModel` (`organizationId`, `employeeId`, `date`, `kind: "missed_in" | "missed_out" | "both" | "wrong_time"`, `requestedCheckInAt?`, `requestedCheckOutAt?`, `reason`, `status: "pending" | "approved" | "rejected" | "cancelled"`, `decidedBy?`, `decidedAt?`, `note?`, `appliedRecordId?`; indexes `{ organizationId: 1, status: 1, createdAt: 1 }` and `{ organizationId: 1, employeeId: 1, date: 1 }`); `PunchCorrectionService.create(employeeId: string, organizationId: string, input: { date: string; kind: …; requestedCheckInAt?: string; requestedCheckOutAt?: string; reason: string }, actor): Promise<Row>` (date within the window and not in the future by the Manila calendar; the times required for the kind; check-out after check-in; reason 1-500 characters; refuses a second pending request for the same date and kind with `ConflictError`); `.cancel(id, employeeId, organizationId, actor)` (own, pending only); `.decide(id, organizationId, { decision: "approve" | "reject"; note?: string }, actor)` (reject needs a note; approve applies the change through `AttendanceService.record` when the day has no record, else `adjust`, then marks the request approved with `appliedRecordId`; if applying fails the request stays pending and the error is returned); `.listForEmployee(employeeId, organizationId)`; `.listPending(organizationId)`. Audit `punch-correction.requested`, `.cancelled`, `.approved`, `.rejected`.

- [ ] **Step 1: Write failing tests:** the window (day 7 allowed, day 8 refused, tomorrow refused; a policy `correctionWindowDays: 14` widens it; no setting uses the constant); each kind's required times and ordering; reason limits; a duplicate pending is refused; cancel works only for the owner and only while pending; approve with no record creates it (status computed by the existing flow, day result built, audit by the existing flow plus the request id in the notes), approve with a record adjusts only what was asked; approving twice conflicts; a failed apply leaves the request pending; reject needs a note; every query is organization-scoped and another employee's request is not found.
- [ ] **Step 2: Run** `npx vitest run tests/domains/attendance/punch-correction-service.test.ts`. Expected: FAIL. **Step 3: Implement** (claim the decision with a conditional update on `status: "pending"` before applying, and roll the claim back if applying throws). **Step 4: Run** and `npm run typecheck`. Expected: PASS. **Step 5: Stage.**

### Task 3.2: Routes

**Files:**
- Create: `src/app/api/self-service/corrections/route.ts`, `src/app/api/self-service/corrections/[id]/route.ts`, `src/app/api/attendance/corrections/route.ts`, `src/app/api/attendance/corrections/[id]/route.ts`
- Modify: `src/shared/validation/attendance.ts` (`createPunchCorrectionSchema`, `decidePunchCorrectionSchema`)
- Test: `tests/app/api/punch-correction-routes.test.ts`

**Interfaces:**
- Produces: `GET`/`POST /api/self-service/corrections` (own list, create; employee from the session), `DELETE /api/self-service/corrections/[id]` (cancel); `GET /api/attendance/corrections` (pending, `attendance.review`), `POST /api/attendance/corrections/[id]` (decide, `attendance.review`).

- [ ] **Step 1: Write failing route tests:** 401, 403 without `attendance.review` on the HR routes, 400 for bad bodies (bad date, missing reason, times in the wrong order), 404 across organizations and for another employee's request, the employee id in a body is ignored, happy paths.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** plus `npx vitest run tests/security`. Expected: PASS. **Step 5: Stage.**

### Task 3.3: Self-service navigation and requests screen

**Files:**
- Create: `src/components/shared/self-service-nav.tsx`, `src/app/(self-service)/requests/page.tsx`, `src/app/(self-service)/requests/request-correction-dialog.tsx`, `src/app/(self-service)/requests/cancel-request-button.tsx`
- Modify: `src/app/(self-service)/layout.tsx` (add the nav), `src/app/(self-service)/clock/page.tsx` (a "Missed a punch? Request a correction" link)
- Test: `tests/app/self-service-nav.test.tsx`, `tests/app/request-correction-dialog.test.tsx`

**Interfaces:**
- Produces: `SelfServiceNav({ items: { href: string; label: string }[] })` (a simple tab bar under the header: Clock, Requests; later Project 5 adds nothing to it); `RequestCorrectionDialog({ minDate: string; maxDate: string })` (kind select, date, time inputs shown per kind, reason; test ids `correction-kind`, `correction-reason`, `correction-submit`); the requests page lists the employee's requests with status, HR's note and a cancel button on pending ones.

- [ ] **Step 1: Write failing tests:** the nav marks the current tab; the dialog shows only the time fields its kind needs, refuses a missing reason or a check-out before check-in before sending, restricts the date input to the window, sends the right body and refreshes; the list shows status and HR's note; cancel asks to confirm.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** (copy `education-record-dialog.tsx` patterns). **Step 4: Run** and `npm run typecheck`. Expected: PASS. **Step 5: Stage.**

### Task 3.4: HR review screen: correction tab and dashboard

**Files:**
- Create: `src/app/(app)/attendance/review/correction-decision-dialog.tsx`
- Modify: `src/app/(app)/attendance/review/page.tsx` (tabs: Flagged punches, Correction requests, Photos), `src/domains/dashboard/compliance-risks.ts` (`punchReviewRisks` takes counts per type), `src/app/(app)/dashboard/page.tsx`
- Test: `tests/app/correction-decision-dialog.test.tsx`; extend `punch-review-risks.test.ts`

**Interfaces:**
- Produces: `CorrectionDecisionDialog({ organizationId, request })` (shows the requested times against the day's current record and the reason; test ids `correction-approve`, `correction-reject`, `correction-note`); `punchReviewRisks(counts: { punches: number; corrections: number; photos: number }, todayKey: string): ActionItem[]` (one row per non-zero type).

- [ ] **Step 1: Write failing tests:** the dialog shows requested and current times; approve and reject send the right bodies, reject needs a note; the risk function returns a row per non-zero count and none when all are zero.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 3.5: Docs and verification
- [ ] Knowledge files, ADR notes, full verification, whole-change review, owner approval before Project 4.

---

## Project 4: Site code (six-digit code and QR)

**Goal:** a rotating code, as typed digits or a scanned QR, as a second proof of presence, configured by policy.

### Task 4.1: The code (pure)

**Files:**
- Create: `src/domains/attendance/site-code.ts`
- Test: `tests/domains/attendance/site-code.test.ts`

**Interfaces:**
- Produces: `codeFor(secret: string, at: Date, stepSeconds: number): string` (six digits: HMAC-SHA256 of the time step number, dynamic truncation as in RFC 4226 / 6238, left-padded); `isAcceptable(secret: string, code: string, at: Date, stepSeconds: number, acceptedSteps: number): boolean` (accepts the current step and `acceptedSteps` steps either side; constant-time comparison via `crypto.timingSafeEqual`; false for anything that is not exactly six digits); `secondsLeftInStep(at: Date, stepSeconds: number): number`; `qrPayloadFor(input: { projectId: string; code: string }): string` (`pcas-site:v1:<projectId>:<code>`); `parseQrPayload(text: string): { projectId: string; code: string } | null`.

- [ ] **Step 1: Write failing tests:** fixed vectors (a known secret and instant give a known code, computed once and written into the test), the same step gives the same code and the next step a different one, drift (`acceptedSteps: 1` accepts the previous and next step and refuses two away; `0` accepts only the current), a wrong, short, long or non-digit code is refused, `secondsLeftInStep` at the start and end of a step, the QR payload round-trips and a foreign or malformed QR text parses to `null`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** with Node `crypto`. **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 4.2: Site secret and service

**Files:**
- Create: `src/domains/attendance/site-code-service.ts`
- Modify: `src/server/db/models/location.ts` (`siteCodeSecret: { type: String, select: false }`, `requireSiteCode: { type: Boolean, default: false }`), the location service and form that edit a location (find with `grep -rn "geofenceRadiusMeters" src`) for the `requireSiteCode` toggle
- Test: `tests/domains/attendance/site-code-service.test.ts`

**Interfaces:**
- Consumes: Task 4.1; `ClockSiteService.resolve`; `AuditService`.
- Produces: `SiteCodeService.currentFor(projectId: string, organizationId: string, now: Date, actor: { userId?: string }): Promise<{ code: string; qrPayload: string; secondsLeft: number; stepSeconds: number }>` (creates the secret on first use, 32 random bytes hex, audited `site-code.secret_created`); `.rotateSecret(locationId, organizationId, actor)` (audited `site-code.secret_rotated`); `.verify(input: { projectId; organizationId; code: string; at: Date; settings: SiteCodeSettings }): Promise<"valid" | "invalid">`. The secret is never returned by any API or log.

- [ ] **Step 1: Write failing tests:** first use creates the secret once (a second call reuses it); the secret is not on a default read of the location and not in any returned object; `currentFor` and `verify` agree at the same instant; after `rotateSecret` an old code is invalid; another organization's project is not found; `requireSiteCode` persists.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 4.3: Policy settings

**Files:**
- Modify: `src/server/db/models/attendance-policy.ts` (`siteCode: { accept, stepSeconds, acceptedSteps }`), `src/shared/validation/attendance.ts`, `src/domains/attendance/attendance-policy-service.ts`, `src/domains/attendance/punch-review-rules.ts` (constant `SITE_CODE_DEFAULTS = { accept: "either", stepSeconds: 60, acceptedSteps: 1 }`, `siteCodeSettingsOf(policy)`, rule `noSiteCode?: { effect }`), `create-policy-dialog.tsx`
- Test: extend `punch-review-rules.test.ts`, `attendance-policy-service.test.ts`, the policy dialog test

**Interfaces:**
- Produces: `type SiteCodeSettings = { accept: "code" | "qr" | "either"; stepSeconds: number; acceptedSteps: number }` (`stepSeconds` 30-300, `acceptedSteps` 0-3); `siteCodeSettingsOf(policy)` filling the defaults.

- [ ] **Step 1: Write failing tests:** defaults when absent; bounds refused (29 and 301 seconds, 4 steps, an unknown `accept`); the service stores them; the dialog shows a "Site code" section with the three settings and sends only what was set.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 4.4: Enforcement on the punch

**Files:**
- Modify: `src/shared/validation/attendance.ts` (clock event: optional `siteCode: { method: "code" | "qr"; value: string }`), `src/server/db/models/attendance-record.ts` (clock event `siteCodeMethod?`), `src/domains/attendance/self-service-attendance-service.ts`, `src/domains/attendance/punch-evidence.ts`, `src/domains/attendance/punch-review.ts` (evidence `siteCode?: "valid" | "missing" | "invalid"`)
- Test: extend `self-service-attendance-service.test.ts`, `punch-review.test.ts`

**Interfaces:**
- Consumes: `SiteCodeService.verify`, `siteCodeSettingsOf`, Project 1's flags.
- Produces: when the location has `requireSiteCode`, a missing or invalid code **blocks** the punch (`BusinessRuleError`, audited `attendance.self_check_in_blocked` / `_check_out_blocked` with the reason, no photo stored); a method the policy's `accept` doesn't allow is refused; when not required, rule `noSiteCode` flags a missing or invalid code with the policy's effect; the record keeps `siteCodeMethod`.

- [ ] **Step 1: Write failing tests:** required + valid code passes; required + missing or invalid blocks with an audit and no photo; method `qr` refused under `accept: "code"` and vice versa, allowed under `either`; not required + invalid flags only when the rule is on; unconfigured behaves as before; the code is checked after WebAuthn and the geofence, in that order.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** and `npx vitest run tests/domains/attendance`. Expected: PASS. **Step 5: Stage.**

### Task 4.5: HR site-code screen

**Files:**
- Create: `src/app/(app)/attendance/site-code/page.tsx`, `src/app/(app)/attendance/site-code/site-code-display.tsx`, `src/app/api/attendance/site-code/route.ts`
- Modify: `src/components/shared/nav-links.tsx`
- Test: `tests/app/site-code-display.test.tsx`, `tests/app/api/site-code-route.test.ts`

**Interfaces:**
- Produces: `GET /api/attendance/site-code?organizationId=&projectId=` (`attendance.review`; `Cache-Control: no-store`; returns `{ code, qrPayload, secondsLeft, stepSeconds }`, never the secret); `SiteCodeDisplay({ organizationId, sites })` (a site picker, the six digits large, the QR drawn with the existing `qrcode` library, a countdown, refreshing at each step; test ids `site-code-digits`, `site-code-qr`).

- [ ] **Step 1: Write failing tests:** the route needs `attendance.review` (401/403), is organization-scoped (404), is `no-store`, and returns no secret; the display shows digits and a QR, counts down, and fetches a new code when the step ends (fake timers); switching site fetches that site's code.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 4.6: Clock page entry and scanning

**Files:**
- Create: `src/app/(self-service)/clock/site-code-entry.tsx`, `src/app/(self-service)/clock/qr-scanner.tsx`
- Modify: `src/app/(self-service)/clock/clock-panel.tsx`, `src/app/(self-service)/clock/page.tsx`, `src/app/api/self-service/attendance/route.ts` (return each site's `siteCodeAccept` and `requireSiteCode`)
- Test: `tests/app/site-code-entry.test.tsx`, `tests/app/qr-scanner.test.tsx`

**Interfaces:**
- Produces: `SiteCodeEntry({ accept: "code" | "qr" | "either"; required: boolean; onChange(value: { method: "code" | "qr"; value: string } | null): void })` (a six-digit field and a "Scan QR" button, each shown only where `accept` allows); `QrScanner({ onScan(text: string): void; onCancel(): void })` (uses the browser's built-in `BarcodeDetector` when present; otherwise it dynamically imports a small decoder library. **That library is a new dependency: name, version at least two weeks old and pinned, and the bundle cost are brought to the owner for approval before this task starts.**).

- [ ] **Step 1: Write failing tests:** only the allowed methods show; a code needs exactly six digits before the clock button enables when required; a scan of a valid payload for the selected site fills the code, a foreign QR or another site's QR is refused with a clear message; when `BarcodeDetector` is missing the fallback path is used (fake both); the request body carries `siteCode`; nothing changes for a site that does not use codes.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** and `npm run typecheck`. Expected: PASS. **Step 5: Stage.**

### Task 4.7: Docs and verification
- [ ] Knowledge files (attendance, data model, authorization if a key is added, testing), ADR notes, the dependency decision recorded, full verification, whole-change review, owner approval before Project 5.

---

## Project 5: Switch device

**Goal:** an employee asks to move their biometric to a new phone; HR approves; the old credentials are removed and the employee registers the new one.

### Task 5.1: Model and service

**Files:**
- Create: `src/server/db/models/device-change-request.ts`, `src/domains/identity/device-change-service.ts`
- Modify: `src/server/db/models/index.ts`
- Test: `tests/domains/identity/device-change-service.test.ts`

**Interfaces:**
- Consumes: `WebAuthnService.resetCredentials(userId, organizationId, actor)` (`webauthn-service.ts:214`, which deletes every credential and audits `webauthn-credentials.reset`); `WebAuthnService.hasRegisteredCredential`.
- Produces: `DeviceChangeRequestModel` (`organizationId`, `userId`, `employeeId`, `reason`, `status: "pending" | "approved" | "rejected" | "cancelled"`, `decidedBy?`, `decidedAt?`, `note?`, `removedCount?`; index `{ organizationId: 1, status: 1, createdAt: 1 }`); `DeviceChangeService.create(session: { userId; employeeId; organizationId }, input: { reason: string }, actor)` (the employee must have a credential; one pending request at a time, else `ConflictError`; reason 1-300 characters); `.cancel(id, userId, organizationId, actor)`; `.decide(id, organizationId, { decision, note? }, actor)` (reject needs a note; approve claims the request, calls `resetCredentials`, records `removedCount`; if the reset fails the request returns to pending); `.latestFor(userId, organizationId)`; `.listPending(organizationId)`. Audit `device-change.requested`, `.cancelled`, `.approved`, `.rejected`.

- [ ] **Step 1: Write failing tests:** create needs a credential and a reason; a second pending is refused; cancel is the owner's, pending only; approve removes the credentials (the employee's `hasRegisteredCredential` becomes false) and records the count; a failed reset leaves the request pending; reject needs a note and removes nothing; another organization's request is not found; deciding twice conflicts.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 5.2: Routes

**Files:**
- Create: `src/app/api/self-service/device-change/route.ts`, `src/app/api/self-service/device-change/[id]/route.ts`, `src/app/api/employee-accounts/device-changes/route.ts`, `src/app/api/employee-accounts/device-changes/[id]/route.ts`
- Modify: `src/shared/validation/` (a device-change schema file or `attendance.ts`)
- Test: `tests/app/api/device-change-routes.test.ts`

**Interfaces:**
- Produces: self-service `GET`/`POST` (own latest, create) and `DELETE [id]` (cancel); HR `GET` (pending) and `POST [id]` (decide). **HR routes require `employees.update`**, the same key the existing biometric reset uses, because approving removes credentials (the plan's other review queues use `attendance.review`; this one stays with the existing security-sensitive key; the owner can change that).

- [ ] **Step 1: Write failing tests:** 401, 403 without `employees.update` on the HR routes, 400 for a missing reason or bad id, 404 across organizations and for another user's request, the user id in a body is ignored.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** plus `npx vitest run tests/security`. Expected: PASS. **Step 5: Stage.**

### Task 5.3: Clock page flow

**Files:**
- Create: `src/app/(self-service)/clock/request-device-change-dialog.tsx`
- Modify: `src/app/(self-service)/clock/clock-panel.tsx`, `src/app/(self-service)/clock/page.tsx`
- Test: `tests/app/request-device-change-dialog.test.tsx`

**Interfaces:**
- Produces: `RequestDeviceChangeDialog()` (reason field, sends `POST /api/self-service/device-change`; test ids `device-change-reason`, `device-change-submit`); `ClockPanel` gains optional `deviceChange: { status: "none" | "pending" | "rejected"; note?: string | null }`, showing a "Using a new phone?" link, "Waiting for HR to approve your device change" while pending, HR's note when rejected; after approval the account has no credential, so the existing set-up card appears.

- [ ] **Step 1: Write failing tests:** the link opens the dialog; a reason is required; pending shows the waiting line and hides the link; rejected shows the note and allows a new request; the clock button still works while pending.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 5.4: HR tab, dashboard count and the new-device rule

**Files:**
- Create: `src/app/(app)/attendance/review/device-change-dialog.tsx`
- Modify: `src/app/(app)/attendance/review/page.tsx` (a "Device changes" tab), `src/domains/dashboard/compliance-risks.ts` (counts gain `deviceChanges`), `src/app/(app)/dashboard/page.tsx`
- Test: `tests/app/device-change-decision-dialog.test.tsx`; extend `punch-review-risks.test.ts` and `self-service-attendance-service.test.ts`

**Interfaces:**
- Produces: the tab and dialog (`device-change-approve`, `device-change-reject`, `device-change-note`; the approve dialog says plainly that the employee's current biometric will stop working); the dashboard row; an integration check that **after an approved change and a fresh registration, punches within the `newDevice` days are flagged** (Project 1's rule needs no change).

- [ ] **Step 1: Write failing tests:** the dialog states the consequence and sends the right bodies, reject needs a note; the risk row appears for pending requests; an end-to-end service test: approve, register a new credential, punch, and the `newDevice` flag appears.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 5.5: Docs and verification
- [ ] Knowledge files (`identity.md` especially), ADR notes, full verification, whole-change review, owner approval before Project 6.

---

## Project 6: Offline punches (owner gate before building)

**Goal:** let a punch be saved on the phone when there is no signal and sent later, always unverified and always reviewed.

**Limits stated up front (confirm before building):**
1. **No biometric, by construction.** WebAuthn needs a fresh server challenge, so an offline punch has no verified assertion. It is recorded `verified: false`, flagged `offlineSync`, and **held for HR at minimum**.
2. **Only if the page is already open.** `public/sw.js` deliberately never caches pages (they hold personal data). So an employee who opens the clock page with no signal gets the offline page. Saving a punch works only when the page was open and the signal dropped. Making a cold start work would mean the service worker caching the clock page shell, which reverses a security decision (ADR-036) and needs its own review. **Not in this plan.**
3. The punch still needs the live photo and a GPS fix (the geofence is judged on the phone's fix and re-judged by the server when it arrives).

### Task 6.1: Server contract

**Files:**
- Create: `src/server/db/models/offline-punch.ts`, `src/app/api/self-service/attendance/offline/route.ts`
- Modify: `src/server/db/models/index.ts`, `src/server/db/models/attendance-record.ts` (clock event `source: "online" | "offline"`, `claimedAt?`, `receivedAt?`), `src/server/db/models/attendance-policy.ts` (`offline: { enabled, maxMinutes }`), `src/domains/attendance/punch-review-rules.ts` (`OFFLINE_PUNCH_DEFAULTS = { enabled: false, maxMinutes: 720 }`, `offlineSettingsOf(policy)`, flag `offlineSync`), `create-policy-dialog.tsx`, `src/domains/attendance/self-service-attendance-service.ts` (`recordOffline`), `src/shared/validation/attendance.ts` (`offlinePunchBatchSchema`)
- Test: `tests/domains/attendance/offline-punch.test.ts`, `tests/app/api/offline-punch-route.test.ts`

**Interfaces:**
- Consumes: Project 1's judging and review model; `ClockSiteService.resolve`, `assertWithinSite`, `AttendancePhotoStorage`.
- Produces: `OfflinePunchModel` (`organizationId`, `employeeId`, `clientId`, `action`, `claimedAt`, `receivedAt`, `result`; **unique** `{ organizationId: 1, employeeId: 1, clientId: 1 }` for idempotency); `SelfServiceAttendanceService.recordOffline(session, punches: OfflinePunchInput[], actor): Promise<OfflinePunchResult[]>` where `OfflinePunchInput = { clientId: string; action: "check_in" | "check_out"; claimedAt: string; latitude: number; longitude: number; accuracy?: number; projectId?: string; photo: string; liveness: { challenges }; deviceKey?: string }` and `OfflinePunchResult = { clientId: string; result: "recorded" | "duplicate" | "rejected"; reason?: string }`; `POST /api/self-service/attendance/offline`. Rules: the policy must have `offline.enabled`; `claimedAt` not later than receipt plus a small allowance and not older than `offline.maxMinutes`; a re-sent `clientId` returns `duplicate` and changes nothing; the geofence is judged as online and a failure is `rejected` and audited with no photo stored; an accepted punch is stored with `verified: false`, `source: "offline"`, the claimed time as `at`, flag `offlineSync` with effect at least `hold`, and `review` pending and holding; a punch that conflicts with an existing record for the day (already clocked in online) is `rejected` with the reason.

- [ ] **Step 1: Write failing tests:** disabled policy refuses the batch; a too-old and a future claimed time are rejected; re-sending a `clientId` is a no-op `duplicate`; outside the geofence is rejected, audited, no photo; an accepted punch is held and unverified and **never** `verified: true`; check-in then check-out in one batch builds one record in order; an existing online record conflicts; flags from Project 1's other rules still apply; organization scoping; the employee comes from the session, not the body.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** and `npx vitest run tests/domains/attendance tests/security`. Expected: PASS. **Step 5: Stage.**

### Task 6.2: The phone-side queue

**Files:**
- Create: `src/lib/offline-punch-queue.ts`
- Test: `tests/lib/offline-punch-queue.test.ts`

**Interfaces:**
- Produces: `interface PunchQueueStore { add(item: QueuedPunch): Promise<void>; list(): Promise<QueuedPunch[]>; remove(clientId: string): Promise<void>; count(): Promise<number> }`; `createIndexedDbPunchQueue(): PunchQueueStore` (a small IndexedDB wrapper, no new dependency); `createMemoryPunchQueue(): PunchQueueStore` (for tests); `MAX_QUEUED_PUNCHES = 20`; `queueOfflinePunch(store, punch)` (refuses past the limit, assigns `clientId = crypto.randomUUID()`); `syncOfflinePunches(store, send)` (sends the batch, removes the items the server answered `recorded`, `duplicate` or `rejected`, keeps the ones that failed on the network).
- **Open item for the owner:** testing the IndexedDB adapter itself needs `fake-indexeddb` as a **dev dependency** (name and pinned version brought for approval); without it the adapter is covered by a manual check list and the logic by the in-memory store.

- [ ] **Step 1: Write failing tests (in-memory store):** enqueue assigns an id and keeps order, the limit refuses the 21st, sync removes recorded, duplicate and rejected items and keeps network failures, a partial server answer is handled item by item, nothing is lost when the send throws.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 6.3: Clock page flow

**Files:**
- Create: `src/app/(self-service)/clock/offline-queue-banner.tsx`
- Modify: `src/app/(self-service)/clock/clock-panel.tsx`, `src/app/(self-service)/clock/page.tsx` (pass `offlineEnabled` from the resolved policy)
- Test: `tests/app/offline-queue-banner.test.tsx`; extend the clock panel tests

**Interfaces:**
- Produces: when `offlineEnabled` and the phone is offline (`navigator.onLine === false`, or the punch request fails with a network error): capture location and the live photo as usual, **skip the biometric step**, save the punch with `queueOfflinePunch`, and show "Saved on this phone. It will be sent when you're back online, and HR will review it." `OfflineQueueBanner({ store })` shows how many punches wait and, after sync, each one's result; sync runs on the browser's `online` event and when the page opens.

- [ ] **Step 1: Write failing tests:** offline with the policy on queues the punch and never calls the WebAuthn challenge route; offline with the policy off shows the normal error and queues nothing; the banner counts waiting punches and reports results; the `online` event triggers sync once; a network failure mid-send keeps the item.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** and `npm run typecheck`. Expected: PASS. **Step 5: Stage.**

### Task 6.4: Review and export

**Files:**
- Modify: `src/app/(app)/attendance/review/punch-review-dialog.tsx`, `src/domains/attendance/attendance-export.ts`
- Test: extend `punch-review-dialog.test.tsx`, `attendance-export.test.ts`

**Interfaces:**
- Produces: the dialog shows an "Unverified (offline)" badge, the claimed time and the time it was received, and the gap between them; the export gains a "Source" column (`online` / `offline`).

- [ ] **Step 1: Write failing tests** for the badge and times and the export column (empty for old records). **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 6.5: Docs, verification and the owner's decision
- [ ] Knowledge files, ADR notes recording the three limits, full verification, whole-change review. **The owner then decides whether to switch `offline.enabled` on anywhere**: the code ships off by default.

---

## Self-review

- Spec coverage: every Part 1 element has a task. Project 1: settings (Task 1), judging (2), evidence and flags (3), decisions (4), payroll (5), screens (6), docs (7). Project 2: model and service (2.1), routes (2.2), capture (2.3), rule and dialogs (2.4). Project 3: service (3.1), routes (3.2), employee screens and navigation (3.3), HR screens (3.4). Project 4: pure code (4.1), secret and service (4.2), policy settings (4.3), enforcement (4.4), HR screen (4.5), clock page and scanning (4.6). Project 5: service (5.1), routes (5.2), clock page (5.3), HR tab and the new-device rule (5.4). Project 6: server contract (6.1), phone queue (6.2), clock page (6.3), review and export (6.4). Non-goals have no task.
- Types: `PunchReviewRules`, `PunchReviewEffect`, `PunchEvidence`, `PunchFlag`, `evaluatePunch`, `reviewOutcomeOf`, `strongestEffect`, `PunchReviewService.list/decide`, the record `review` shape, `SiteCodeSettings`, `siteCodeSettingsOf`, `OfflinePunchInput/Result` and each project's service method names are used identically wherever they appear. Every request-style service shares the same decision contract: `decide(id, organizationId, { decision: "approve" | "reject"; note? }, actor)`, reject needs a note, only `pending` can be decided.
- Decisions that need the owner before a task starts: the QR decoder fallback library (Task 4.6), the `fake-indexeddb` dev dependency (Task 6.2), the permission for device-change approval (Task 5.2, defaults to `employees.update`), and whether Project 6 ships at all (its three stated limits).
- Proportion: each project is planned to task level with files, interfaces and test cases, and no code bodies.
