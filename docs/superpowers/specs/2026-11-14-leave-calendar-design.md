# Leave calendar and working-day counting: design

**Date:** 2026-11-14. **Status:** draft for the owner's approval. **Size:** a project (four connected parts).
**Code read for this design:** `src/domains/leave/leave-request-service.ts`, `src/app/(app)/leave/page.tsx`,
`new-request-dialog.tsx`, `src/app/(app)/people/[id]/leave-tab.tsx`, `src/domains/holidays/`,
`src/domains/payroll/payroll-policy-service.ts`, `src/app/(app)/events/events-calendar.tsx`, `knowledge/domains/leave.md`.

## 1. Intent and why

HR (or a user with the right role) files leave requests for employees. They do this so they can **monitor leave
dates**: who is out, on which days, and what is coming up. Today the Leave page is a requests table, and the request
dialog is two bare date fields. There is no calendar, nothing shows how many days a request will use or what balance
is left while filing, and an overlap with existing leave is only reported as an error after submitting.

The owner also chose, on 2026-11-14, that leave should be charged in **working days**, in line with Philippine
practice, not calendar days. Today a Friday-to-Monday request is charged 4 days.

## 2. Goals, non-goals, anti-goals

**Goals**
- See at a glance who is on leave on any day of a month, and what is pending approval.
- When filing, see the number of days that will be charged and the balance afterwards, and be warned about overlap
  before submitting.
- Charge working days: skip each employee's rest days and holidays that are days off.
- See one employee's leave dates on their profile.

**Non-goals** (this change)
- Half-day or hourly leave.
- Counting days from an individual employee's own schedule (schedules are reference-only, ADR-027).
- Employees filing their own leave, notifications, or accrual of balances.
- Rewriting any existing request or balance.

**Anti-goals** (would make this a failure even if it technically works)
- A second, different day-counting rule in the browser that disagrees with what the server charges.
- Old requests silently changing their day count or an employee's balance.
- A calendar that is slow on a large organization, or that exposes leave to people who lack `leave.read`.

## 3. Constraints

- Layering and rules: `knowledge/layers.md`, `CHANGE_PROTOCOL.md`, ENGINEERING §§ 27, 35, 36–37, 46, 52, 55, 58–60.
  No business rule in a route or component. Scope (organization, project) comes from the server. Audit every state change.
- Preserve existing behavior (§52): stored `totalDays` on existing requests stays as it is. New fields are optional.
- `totalDays` feeds balances (`getAvailable`), the Leave summary strip and the dashboard. Their meaning stays
  "days charged".
- Leave permissions stay as they are (`leave.read`, `leave.create`, `leave.update`, `leave.approve`).
- Dates are calendar-day keys (`YYYY-MM-DD`), "today" is the organization's Manila day (ADR-045). Never use the
  server's local date.

## 4. Approaches considered

**How to decide what counts as a working day**
- **A. Payroll policy workweek plus the holiday calendar.** Chosen. Payroll and final settlement already read the
  week from the payroll policy (`workWeekDays`, default Monday–Friday, can be 6 days). Skip active holidays whose type is a
  day off (regular, special non-working; not special working). Consistent with pay, explainable in a sentence.
- B. The employee's own schedule where one exists, otherwise A. More exact for rotating shifts, but schedules are optional and
  reference-only, so counts would differ person to person and be harder to explain. Kept as a later extension.
- C. HR types the number. Defeats the point of a computed count.

**How to build the calendar**
- **1. A server-rendered Calendar tab on the Leave page, month taken from the web address, reusing the events calendar's
  grid helpers (`buildMonthGrid`, `groupByDate`, `shiftMonth`).** Chosen (builder's call, stated to the owner). Matches the Schedules
  and Events pages, works without a client fetch, easy to link to a month.
- 2. A client component that fetches each month from an API. More moving parts and a loading state for no clear gain here.

## 5. The design (decided parts)

### 5.1 Working-day rule (one place)

A pure function (suggested `src/domains/leave/leave-days.ts`) takes a start key, an end key, the work-week days, and the
holidays in range. It returns the calendar days, the working days to charge, and the skipped days with the reason
(rest day, or the holiday's name). The server and the preview both call it. Nothing else counts days.

- The work-week days come from the **resolved payroll policy** for the employee's project as of the request's start date
  (`PayrollPolicyService.resolve`), falling back to Monday–Friday when no policy applies, as final settlement does
  (`final-settlement-service.ts`).
- Holidays are active `Holiday` rows in range whose type is a day off (`isDayOff`).
- A range with **no working days** is refused with a plain message ("Those dates are all rest days or holidays").

### 5.2 Creating a request

`LeaveRequestService.create` uses the rule above. `totalDays` stores the working days charged. Two new **optional** fields
on `LeaveRequest` record how it was counted: `calendarDays` and `dayCountMethod` (`"working"`). Rows without them are read as
the old calendar-day method. The audit entry for creation includes both counts. The balance check, overlap check and
`decide` re-check stay as they are, now over working days.

### 5.3 Preview endpoint

A read endpoint (suggested `GET /api/leave-requests/preview`, permission `leave.read`, organization-wide like the other leave
routes) returns for an employee, leave type and dates: calendar days, working days, the skipped days with reasons,
available balance and balance after, and any overlapping pending or approved requests (employee, dates, status). It uses
the same functions as `create`, so what the form shows is what gets charged.

### 5.4 Request form

The new-request dialog shows a live panel once employee, type and both dates are chosen: "Nov 13 – Nov 16: 4 calendar days,
2 working days charged (Sat, Sun skipped)", the balance left, and an overlap warning that names the conflicting request.
Submit is disabled when the range has no working days. Server errors still show as they do today.

### 5.5 Calendar tab

`/leave` gets two views, **Calendar** and **Requests** (the existing table, unchanged). The Calendar view:

- A month grid with previous/next month navigation. Each day shows who is out as compact chips (name or count when crowded),
  approved solid and **pending striped**. Holidays from the holiday calendar are marked. Weekends and rest days are shaded.
- Filters: leave type, and status (default approved plus pending).
- A summary strip: out today, out this week, starting soon.
- Clicking a day opens a panel listing everyone out that day with leave type, dates and status, and a link to the request.
- Phone width: the grid collapses to an agenda list for the month.
- Data comes from one query for requests overlapping the month (a new service method), not one query per day. Names come from the
  roster the page already loads.
- Needs `leave.read`.

### 5.6 Employee profile

The Leave tab on `people/[id]` gains a "Leave dates" card above or beside the balances: upcoming first, then past, with status
and days charged. The data is already loaded for that tab.

### 5.7 Mixed counting in one year

A year can hold old calendar-day requests and new working-day requests. Existing balances are not rewritten. The balances page and the
employee card show a small note when a balance includes requests counted the old way, using the `dayCountMethod` marker.

### 5.8 Points settled after the builder check

Answered by the project: **who the calendar shows.** Leave routes and `leave.read` are organization-wide, and project scope does
not cover leave (ADR-043, `knowledge/domains/leave.md`). The calendar, the day panel, the new month query and the preview's overlap
list are all organization-wide, and need `leave.read`. **Holidays** are organization-wide too (`Holiday.scope` is only a free-text
label), so they apply to every employee's count.

Calls made by the writer (marked, easy to change):
- **Policy changes inside a range:** the whole range is counted with the policy resolved on the **start date**. This keeps the rule a
  single pure function with one weekday set. An employee with no project uses the organization policy; a policy with no
  `workWeekDays` falls back to Monday–Friday. The preview says which policy or fallback it used.
- **`decide` never recounts.** It re-checks the balance with the stored `totalDays`, for old and new rows alike. A request filed before
  this change and approved after it keeps the days it was filed with.
- **No working days:** the preview returns a normal response with zero working days and a flag, so the form can explain it. `create`
  refuses it on the server.
- **Summary strip:** "out today" counts approved requests only. "This week" runs Monday to Sunday. "Starting soon" keeps the existing
  30-day window. Pending requests show in their own count, as the page does today.
- **Default tab:** `/leave` still opens the **Requests** table, so existing links and tests keep working. The calendar is
  `/leave?view=calendar&month=YYYY-MM`. Flipping the default later is a one-line change.

## 6. Testing (expectations)

- Domain: the rule across weekday sets (5-day, 6-day), holidays on a workday and on a rest day, special working day not skipped,
  all-off range refused, single day, month and year boundaries.
- Historical test (§59): an old request keeps its `totalDays` and the balance is unchanged after the change.
- Server: preview and create agree for the same inputs; cross-organization requests are refused; overlap and balance checks still work.
- UI: the form panel updates and blocks all-off ranges; the calendar shows pending vs approved, holidays, the day panel and the
  filters; the agenda layout on phone width.
- Baseline `npm run typecheck`, `lint`, `npm test`, and `npm run build` before and after.

## 7. Left to the builder

Chip design and ordering when a day is crowded, exact colors (use the existing chart palette tokens), the agenda layout,
the wording of messages, the file and component names, whether the day panel is a dialog or a side sheet, and the placement of
the profile card.

## 8. Known risks and open items

- No payroll policy for an employee's project: fall back to Monday–Friday and say so in the preview.
- The overlap and balance checks in `create` are read-then-insert and not transactional (existing gap in `knowledge/domains/leave.md`).
  This change does not fix it.
- `cancel` is not a conditional update (existing gap). Not changed here.
- Working-day counting changes what new requests deduct. The owner decided this on 2026-11-14.
