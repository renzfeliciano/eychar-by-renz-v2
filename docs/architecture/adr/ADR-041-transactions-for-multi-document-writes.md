# ADR-041: Transactions for multi-document writes

## Status

Accepted. Supersedes ADR-014 Decision 3 for the write step only, and the "no transaction" notes in
ADR-005 (transfer) and ADR-033 (recycle bin).

## Context

ADR-014, ADR-005 and ADR-033 chose not to use MongoDB transactions: compute everything in memory, then
write, and undo by hand on failure. That kept a half-computed payroll run from ever being written, but
the writes themselves could still split:

- Recalculating a payroll run deleted its records, then inserted the new ones. A crash or timeout in
  between left a run with no records, or totals that didn't match them.
- Moving a record to the recycle bin (and restoring it) touched several collections in sequence.
- Disbursing a final settlement closed the clearance first, then saved the settlement.
- A transfer closed the current assignment, then created the new one.

Atlas supports transactions, and the cost ADR-014 named (switching the test database to a replica set)
is a one-file change.

## Decision

- `src/server/db/transaction.ts` exports `withTransaction(work)`, a thin wrapper on Mongoose's
  `connection.transaction` (commits on success, aborts on throw, retries transient errors).
- It wraps only the group of writes that must not split, not whole service methods: payroll run
  recalculation (records + totals) and the clean-up of a failed prepare; recycle-bin delete, restore and
  purge; settlement disbursal with the clearance close; assignment transfer.
- Compute-then-persist (ADR-014) still applies: everything is computed before the transaction opens, so
  transactions stay short and safe to retry.
- Audit records are written after the transaction commits, as before.
- Tests run on a single-node `MongoMemoryReplSet` (`tests/global-setup.ts`), since transactions need a
  replica set. `tests/server/db/transaction.test.ts` proves commit and rollback.

## Consequences

- Every operation inside `work` must pass `{ session }`; one that doesn't runs outside the transaction.
  Operations inside must run one after another, never in `Promise.all`.
- A transaction has a 60-second lifetime on Atlas. Deleting a record with a very large history to the
  recycle bin could hit it; the delete then fails cleanly with nothing moved, rather than half-moved.
- Hiring (Person → Employee → Employment → Assignment) stays as separately audited writes (ADR-005);
  making it atomic means passing a session through four services, worth doing only if a partial hire is
  ever seen.
