# Dashboard (role-aware to-do landing page)

**Purpose:** The signed-in landing page: ranked actions the viewer must take, legal and compliance deadlines, unresolved clearance red flags, who is out today, and upcoming events. It is a to-do list, not a report (page comment, `src/app/(app)/dashboard/page.tsx`).
**Governing docs:** ARCHITECTURE.md § Dashboard (line 610); ADR-031 and ADR-032 (red flags); ADR-053 (probation evaluations); ADR-045 (time zone); ENGINEERING.md § 23 (UI authorization), § 41 (mobile-first UI).

**Services:** No service object and no DB access in this folder. All functions are pure and take already-loaded data:
- `src/domains/dashboard/action-queue.ts`: `rankActions`, `urgencyFor`, `relativeDue`, `daysBetween`, `collapseKind`; types `ActionItem`, `ActionUrgency`.
- `src/domains/dashboard/compliance-risks.ts`: `regularizationRisks`, `finalPayRisks`, `documentRisks`, `regularizationFollowUpKey`, `RISK_WINDOW_DAYS` (30), type `ProbationEvaluations`.
- `src/domains/dashboard/red-flags.ts`: `clearanceRedFlags`, `redFlagTotal`; types `RedFlag`, `RedFlagStage`.
- `src/domains/dashboard/dashboard-summary.ts`: `greetingFor`, `upcomingEvents`.
- Composition lives in `src/app/(app)/dashboard/page.tsx`. It loads from `OrganizationService.listAccessibleTo`, `EmployeeService.listWithCurrentStatus`, `EmploymentStatusService`, `EmploymentTypeService`, `LeaveRequestService`, `LeaveTypeService`, `AttendanceService.listForOrganization`, `TravelOrderService`, `EventService`, `CaseService`, `CaseStatusService`, `PayrollRunService`, `CompensationService`, `ClearanceService.listForOrganization`, `FinalSettlementService.listForOrganization`, `EmployeeDocumentService.listExpiringForOrganization`, `HolidayService.listBetween`, `EvaluationFollowUpService`, `AuditQueryService.list`.

**Models:** None owned. Reads indirectly: Employee, Employment, LeaveRequest, AttendanceRecord, Event, TravelOrder, Case, PayrollRun, ClearanceCase, FinalSettlement, EmployeeDocument, AuditLog.

**Routes:** None. There is no `src/app/api/dashboard` route.

**Pages:**
- `src/app/(app)/dashboard/page.tsx`, with `loading.tsx` and `evaluation-follow-up-dialog.tsx`.

**Tests:** `tests/domains/dashboard/action-queue.test.ts`, `compliance-risks.test.ts`, `dashboard-summary.test.ts`, `red-flags.test.ts`. No test renders or loads the page.

**Rules a change must respect:**
- Each section loads only when the viewer holds its module's permission. The page maps permission keys through `hasPermission` (`dashboard/page.tsx`, the `can(...)` list around lines 118-139) and passes `null` for sections the viewer may not read.
- Settlement details appear only with `final-settlements.read`. Without it, `clearanceRedFlags` receives `null` for settlements and says only "unresolved in clearance" (`red-flags.ts` lines 47 and 79-80).
- Red flags are items with status `flagged`. They leave when the item is cleared or waived, when the case is cancelled or closed (line 50), or when the settlement is disbursed (line 52). Largest amounts sort first (line 76).
- Probation watch: only employment types with `regularizeAfterMonths` are checked; the window is 30 days; a probation is handled once a follow-up is recorded or an evaluation was submitted on or after hire (`compliance-risks.ts` `regularizationRisks`, lines 45-74; ADR-053).
- Final pay deadline = last working day plus the organization's `finalPayDays`; disbursed and cancelled settlements are excluded (`finalPayRisks`). Each row also names what still holds the pay up (`openIssues`): the case's flagged items with their total, and blocking items still pending. These are counted from the same `flagged` items the Red flags panel lists.
- Red-flag resolution text says "on hold" for a flagged amount that a submitted, reviewed or approved settlement doesn't deduct, because `FinalSettlementService.act` refuses to move it on until it's recomputed (ADR-032).
- Document expiry watch: 30-day window (`documentRisks`, lines 106-122).
- Urgency comes from `urgencyFor` with per-kind windows; more than a set number of rows of one kind collapse into a summary row (`collapseKind`; the limit is set near `page.tsx` line 57).
- "Today" is `localDateKey(now)`, the Manila date (`page.tsx` line 100).
- The activity feed drops `auth.*` entries (`page.tsx` line 183).
- No statistics or charts on this page (page comment).

**Known gaps / mismatches:**
- **Attendance "who is out" uses the UTC day.** `AttendanceService.listForOrganization(organizationId, { date: now })` (`page.tsx` line 169) reduces `now` through `toCalendarDateUtc`, while `todayKey` on the same page is the Manila date (line 100). Between 00:00 and 08:00 Manila the two describe different days. Same root cause as the attendance file.
- **Logic is in the page, not the domain.** Permission-to-section mapping (a 17-key `Promise.all` over `hasPermission`), the large data-loading `Promise.all`, and the "who's out" join are inside `page.tsx`, which is several hundred lines. Only the pure helpers are tested, so the page's wiring has no test.
- **Date-key mixing.** The expiring-documents query passes `new Date(\`${addDays(todayKey, 30)}T23:59:59Z\`)` (`page.tsx` line 180), a UTC end-of-day for a Manila-based window. Minor, but the same inconsistency.
- ARCHITECTURE.md § Dashboard matches the code on permissions, red-flag rules and the no-statistics rule.

**Last verified:** 6587050.
