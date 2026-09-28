# ADR-028: Attendance export from the daily roster

## Status

Accepted

## Context

HR asked for CSV and Excel exports of attendance records from the Daily roster, matching the
schedule export (ADR-027). The roster shows one day at a time. Exports are usually wanted for a
day, a semi-monthly payroll cutoff (1st–15th, 16th–end) or a whole month.

## Decision

- **Range, not a single day.** `GET /api/attendance/export?organizationId&from&to&format=xlsx|csv`
  takes any range of up to 31 days (`attendanceExportQuerySchema`; the end can't be before the
  start). That covers a full month or payroll cutoff in one quick request, even for a large roster.
  It needs `attendance.read`.
- **Same rows as the screen.** `AttendanceReportService.build` returns one row per employee per day.
  A day with nothing logged reads "No record" instead of being left out, so absences are visible.
  - **Who is listed:** current staff (the shared `loadCurrentStaffCheck`, the dashboard/schedule
    rule), plus anyone no longer current who has a record in the range.
  - **Row order:** by date, then name.
  - **Columns:** status (catalog name), local check-in/out times, hours worked, site, distance
    from site, biometric verification, who recorded it (Self-service/HR), notes, and **the
    scheduled shift** from ADR-027.

  Putting the plan next to the actual record lets HR compare them in the spreadsheet today, before
  any in-app comparison exists.
- **Files.**
  - **Excel.** An "Attendance" sheet: title, frozen header, autofilter, "No record" rows greyed.
    A "Summary" sheet: per employee, days per status (catalog order, then any retired code found,
    then "No record") and total hours.
  - **CSV.** The same long format, with a UTF-8 BOM for Excel.
- **UI.** An "Export" button in the roster header opens a dialog. It defaults to the day on
  screen, offers one-click presets for the 1st–15th, the 16th–end and the whole month of that day,
  and has custom From/To fields. The download links are plain GET links, disabled with the
  validation message while the range is invalid.
- `filenameSlug`/`csvResponse`/`xlsxResponse` (`src/app/_shared/file-response.ts`) are shared with
  the schedule export.

## Consequences

- Photos are never loaded for the export (`-checkIn.photo -checkOut.photo`), so it stays fast.
- Times are the server's local wall-clock time, the same as the roster screen.
- Longer ranges (e.g. a quarter) need several exports. The 31-day cap can be raised later if paging
  or streaming is added.

## Addendum: every module exports the same way

People (employee roster), Case monitoring and Travel orders previously had a CSV-only button. All
four modules now use one pattern:

- **The dialog.** An "Export" button opens the shared `ExportDialog`
  (`src/components/shared/export-dialog.tsx`), which offers **Excel** (formatted) or **CSV**. Print
  stays next to it.
- **One spec per module.** Each module declares a `TableExportSpec`: title, sheet name, noun, and
  columns with width, wrap and value. Both formats are built from that spec
  (`src/lib/export/table-export.ts`), so they can't drift apart.
- **The Excel template.**
  - "{Organization}: {title}" on top, then the record count and when the file was generated.
  - A numbered, frozen and filterable header row.
  - Long text wraps.
  - It prints landscape at one page wide, with the header repeated on every page.
  - Neutral colors, the same as the attendance and schedule workbooks.
- **Where files are built.**
  - Module lists already arrive fully resolved from the server page, so those files are built in
    the browser, and `exceljs` is loaded only when someone picks Excel.
  - Attendance and schedules still build on the server, because they need their own queries over
    a date range.
- **Filenames** are `{org}-{module}-{YYYY-MM-DD}` (`src/lib/export/filename.ts`).
