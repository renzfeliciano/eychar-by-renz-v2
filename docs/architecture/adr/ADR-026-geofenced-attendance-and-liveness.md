# ADR-026: Geofenced self-service attendance with a live-face check

## Status

Accepted — supersedes ADR-020's "geolocation and photo are best-effort metadata" decision. The rest
of ADR-020 (self-service identity, WebAuthn as a hard precondition, base64 photo storage) stands.

## Context

ADR-020 shipped clock-in/out gated only on a WebAuthn biometric; the photo and GPS fix were optional
and silently skipped on failure. In practice they were *always* skipped: the app's own
`Permissions-Policy: camera=(), geolocation=()` header disabled both APIs for every origin including
this one, so `getUserMedia`/`getCurrentPosition` failed on every clock-in.

The user asked for attendance to be judged by *where* it happens: an employee picks the project
they're working at, the project has a site, and a clock-in is only valid within that site's vicinity.
They also asked that the photo be demonstrably live. Presented with the tradeoffs, they chose,
explicitly:

- **Block** an out-of-range clock-in/out outright — not record-and-flag for HR review.
- **Active liveness**: a randomized blink/head-turn challenge via on-device face detection, accepting a
  one-time ~15 MB model download — not just "live camera only".
- **Any active project with a site**, the employee's assigned project pre-selected — not locked to the
  assignment's project, since people rotate between sites.

## Decision

- **Site = Project → Location.** `Location` gains `latitude`, `longitude` (optional as a pair —
  `LocationService` rejects half of one) and `geofenceRadiusMeters` (10–5000, default 100). A project
  is a clock-in site when it's active and linked to an active location that has coordinates.
  `ClockSiteService` derives sites on read (never stored), so HR moving a project or changing a
  radius takes effect on the next clock-in. Coordinates live on Location, not Project, because
  projects already reference a Location (AGENTS.md §17) and several projects can share one site.
- **HR tooling.** Locations and Projects gain edit dialogs (`LocationService.update`,
  `ProjectService.update`, "" clears a field via the existing `clearable()` convention). The location
  form fills coordinates from the device's GPS or from a pasted Google Maps "lat, lng" pair.
- **Server-authoritative geofence.** `SelfServiceAttendanceService.checkIn()` requires `projectId`,
  resolves the site, and throws `BusinessRuleError` when the haversine distance
  (`src/domains/attendance/geofence.ts`) exceeds the radius. `checkOut()` enforces the same radius
  against the project stamped on the morning's record (falling back to a client-sent project only for
  an HR-recorded check-in that has none), and still works if that project was deactivated mid-day.
  WebAuthn is verified *before* the geofence, so a blocked attempt is audited
  (`attendance.self_check_in_blocked` / `_check_out_blocked`, resourceType `Employee`, with
  position/distance/radius in `metadata`) against a confirmed identity. The clock screen runs the same
  pure geofence check first purely as UX — so nobody sits through the face check to be turned away.
- **Policy follows the site.** Late/present is computed with the *selected* project's
  `AttendancePolicy`, not the assignment's home project.
- **Record shape.** `AttendanceRecord.projectId` (the site worked that day). Each clock event
  snapshots `locationId`, `distanceMeters`, `radiusMeters` and `liveness.challenges`, so later site
  edits never rewrite what an old clock-in was measured against.
- **Liveness.** MediaPipe Face Landmarker (`@mediapipe/tasks-vision`) runs in the browser against the
  live camera stream. `src/lib/liveness/liveness-session.ts` (pure, unit-tested) asks for one blink
  plus one head turn in a random direction and order (4 sequences), requires open→closed→open for a
  blink and a held turn, resets if a second face appears, and ends by requiring the person to face the
  camera with eyes open — the photo is captured from that same stream at that moment. The WASM runtime
  is copied from `node_modules` into `public/mediapipe/wasm` by `scripts/copy-mediapipe-wasm.mjs`
  (`predev`/`prebuild`, gitignored); the 3.7 MB model (`face_landmarker.task`, float16 v1 from Google's
  official MediaPipe model storage) is committed under `public/mediapipe/models`. Self-hosting keeps
  clock-in free of third-party CDNs; CSP only needed `'wasm-unsafe-eval'` added to `script-src`.
- **Required inputs.** The clock schemas now require latitude/longitude, a `data:image/jpeg` photo
  (≤1.5 MB of base64) and `liveness.challenges`.
- **Headers.** `Permissions-Policy` is now `camera=(self), microphone=(), geolocation=(self)`.
- **Lists stay light.** `AttendanceService.listFor*` and `getTodayRecord` exclude `checkIn.photo` /
  `checkOut.photo` (same list-vs-detail split as ADR-025), since every self-service record now carries
  up to two photos.

## Consequences

- **Liveness and GPS are client-reported.** A determined attacker who modifies the page, or spoofs
  location at the OS level, can defeat both — no browser-only system can prevent that. This raises the
  bar against casual buddy-punching (holding up a photo, clocking in from home) and leaves an audit
  trail (photo, position, distance, blocked attempts), but server-verifiable liveness would need a
  server-side face model or a third-party verification service.
- **GPS accuracy matters with blocking.** Phones outdoors are typically within ±5–20 m; laptops and
  indoor phones on Wi-Fi positioning can be off by 50–500 m, which can block a genuine on-site
  employee. The radius is per-location for exactly this reason; the clock screen tells the employee
  when their fix is less precise than the radius.
- **Clock-out is also geofenced.** Someone who leaves the site before clocking out can't clock out
  remotely; HR corrects that day via the existing Adjust flow.
- **First clock-in on a device downloads ~15 MB** (WASM + model; cached afterwards). The model starts
  loading when "Clock In" is pressed so it overlaps the GPS fix.
- **Existing projects aren't clock-in sites until HR sets them up** — every seeded project starts
  with no location, and the clock screen says so.
