# ADR-044: Growing past the free tier (storage, indexes, connections, batching, paging)

## Status

Accepted. Builds on ADR-038 (object storage) and ADR-041 (transactions).

## Context

The app runs on Vercel Hobby (serverless functions with a short time budget, 4.5MB bodies) and
MongoDB Atlas M0 (512MB, limited connections). A review sized for 2,000 employees, 50 projects and
a year of attendance found things that would stop working well before that: clock-in photos
stored in the database, per-record queries, one-at-a-time bulk writes, whole-collection loads,
missing indexes, and a connection pool sized for a long-running server.

## Decision

- **Clock-in/out photos go to private object storage** like documents (ADR-038). With
  `BLOB_READ_WRITE_TOKEN` set they're stored at `attendance-photos/<org>/<employee>/<uuid>.jpg` and
  the record keeps `checkIn/checkOut.photoStorage { provider, key }`; without it they stay inline
  in `photo` as before. `src/server/storage/attendance-photo-storage.ts`. Older inline photos move
  with `npx tsx scripts/migrate-attendance-photos.ts` (dry run by default, `--apply` to write,
  `--org <id>` to limit, idempotent, refuses to run without a Blob token). A recycle-bin purge
  deletes the blobs of purged photos and documents after the commit (best effort: a failure leaves
  an orphan file, never a dangling record).
- **Indexes are created by a script, not at runtime.** In production the connection sets
  `autoIndex: false` and `autoCreate: false` and skips `model.init()`, so cold starts don't send
  index builds. Run `npx tsx scripts/sync-indexes.ts` against the production `MONGODB_URI` once
  per deploy that adds or changes an index. It only creates indexes (never drops); indexes the
  schemas no longer declare are listed for review. Development and tests still build indexes
  automatically.
- **Connection pool:** `maxPoolSize` 5 per instance (override with `MONGODB_MAX_POOL_SIZE`),
  `minPoolSize` 0, idle connections close after 10 seconds.
- **New indexes**, each named after the query it serves: employee assignments by organization and
  effective date (org chart), audit log by resource and by actor (security page, audit filter),
  employees by organization (the existing one was partial), leave requests by organization and
  start date, compensation by organization and effective date, role assignments by organization
  and creation date.
- **Batched work:**
  - The attendance project filter resolves every record's project with one assignment query
    (`assignmentsAsOf`), not one per record.
  - Bulk leave grants and bulk pay changes read everything first, check every rule, then write in
    batches with one audit insert (`AuditService.recordMany`). A bulk pay change's closes and
    opens share one transaction.
  - Each payroll-schedule pass (cron, payroll page, "Prepare due runs") prepares at most 3 due
    schedules, oldest cutoff first; the rest are reported as deferred and picked up by the next
    pass. Runs in one pass share one roster load per organization. The payroll page starts its pass
    after the response (`after()`), so it renders immediately.
- **Paging in the database:** the Leave page (`LeaveRequestService.page` / `summary`), the daily
  attendance roster (`AttendanceService.dayRoster`) and the dashboard's leave numbers
  (`countPending`, `listCoveringDate`) no longer load whole collections. `listWithCurrentStatus`
  returns only the fields callers use and is read once per server render.

## Consequences

- **The index script must be run after deploys that change indexes**, or new unique indexes
  won't exist in production.
- Atlas M0 now holds metadata, not photo or document files, once a Blob store is connected.
- Payroll schedules due on the same day may take more than one pass when there are many.
- FerretDB (used in some local checks) lacks transactions and several aggregation stages; the new
  queries avoid those stages, and transaction paths are verified on a real replica set in CI.
