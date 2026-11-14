/**
 * Fills the stored day result (worked, late, undertime, overtime and night
 * minutes, day type) on attendance records written before it existed (plan
 * Phase 3). See src/domains/attendance/day-result-backfill.ts.
 *
 *   npx tsx scripts/backfill-day-results.ts                 # dry run: report only
 *   npx tsx scripts/backfill-day-results.ts --apply         # write the results
 *   ... --org <organizationId>                              # only one organization
 *
 * Only from stored data: the policy stored on each record (else the one in
 * force on its date, never today's), the day's schedule snapshot and the
 * payroll policy for that date. Idempotent: records that already have a
 * result are never touched. Each fill is audited (attendance.recalculated).
 * Needs MONGODB_URI (from .env.local / .env or the environment). Run the dry
 * run first, and on a copy of the data. Run the calendar-day backfill
 * (scripts/backfill-attendance-dates.ts) before this one.
 */
import mongoose from "mongoose";
import { config } from "dotenv";
import { backfillDayResults } from "@/domains/attendance/day-result-backfill";

config({ path: ".env.local", override: true });
config({ path: ".env" });

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const organizationId = flag("--org");
  if (process.argv.includes("--org") && !(organizationId && mongoose.Types.ObjectId.isValid(organizationId))) throw new Error("--org needs an organization id");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  console.log(apply ? "APPLY: filling stored day results" : "DRY RUN: records without a stored day result");
  const report = await backfillDayResults({ apply, organizationId, log: (line) => console.log(`  ${line}`) });
  const flags = Object.entries(report.flagCounts).map(([name, count]) => `${name} ${count}`).join(", ") || "none";
  console.log(`${apply ? "Done" : "Dry run"}. Without a result: ${report.scanned}. Filled: ${report.filled}. Flags: ${flags}.${apply ? "" : " Re-run with --apply to write them."}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
