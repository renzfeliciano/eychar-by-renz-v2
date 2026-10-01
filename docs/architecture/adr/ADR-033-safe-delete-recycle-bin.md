# ADR-033: Safe delete and recycle bin (Super Administrator only)

## Status

Accepted (2026-10-01).

## Decision

Only the organization's Super Administrator can delete records. Deleting moves the record and
everything attached to it into a recycle bin for 30 days, then purges them.

- **Plans:** `src/domains/deletion/deletion-registry.ts` defines, per record type, what goes with it
  and what blocks it.
  - **People go with their records:** an employee takes their employment, assignments, pay terms,
    leave, attendance, schedule, assets, documents, reviews, clearance and settlement, draft
    payroll lines and their login.
  - **Shared links are trimmed, not deleted:** shared travel orders drop them, and anyone reporting
    to them has the manager cleared. These patches are undone on restore.
  - **Shared setup is refused while in use:** positions, projects, locations, units, leave types
    and shifts, with the preview saying where they're used.
- **Protected:**
  - approved or released payroll history;
  - paid final settlements;
  - the Super Administrator's own account;
  - your own account.
- **Mechanics:**
  - Each removed document is stored as-is in `DeletedRecord` (raw BSON, one per document, so large
    files don't hit the 16 MB limit) under a `DeletionBatch`.
  - Restore re-inserts the same documents (same `_id`s) and undoes the patches. If something with
    the same unique number or code was created since, restore stops and rolls back.
- **Safety:**
  - every delete shows a preview and needs the record's name typed;
  - every delete, restore and purge goes to the audit log;
  - delete permissions can't be granted to any role (ADR-030 addendum: Super Administrator).
- **Purging:** expired batches are purged when the Recycle bin page is opened and by
  `/api/cron/recycle-bin` (daily, `CRON_SECRET`).

## Consequences

- **Delete isn't transactional:** a failure mid-way can leave a partial batch, which the bin still
  restores.
- **Coverage:** new record types must be added to the registry before they can be deleted.
  Record types not in it can't be deleted at all, which is the safe default.
- **Cron:** no scheduler file exists yet. To run the purge and payroll jobs automatically, add a
  `vercel.json` cron or an external scheduler.
