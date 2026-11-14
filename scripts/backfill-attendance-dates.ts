/**
 * Moves attendance records filed under the UTC day onto the organization's
 * own calendar day (gap B3). A clock-in between 00:00 and 08:00 Manila was
 * stored under the previous day before the fix. See
 * src/domains/attendance/attendance-date-backfill.ts.
 *
 *   npx tsx scripts/backfill-attendance-dates.ts                 # dry run: report only
 *   npx tsx scripts/backfill-attendance-dates.ts --apply         # move the records
 *   ... --org <organizationId>                                   # only one organization
 *   ... --json <file>                                            # also write the full report as JSON
 *
 * Idempotent. Never deletes or overwrites: if the employee already has a
 * record on the target day, both are left as they are and the pair is listed
 * under "Collisions" for HR to resolve. Each move is audited
 * (attendance.date_corrected). Needs MONGODB_URI (from .env.local / .env or
 * the environment). Run the dry run first, and on a copy of the data.
 */
import { writeFileSync } from "node:fs";
import mongoose from "mongoose";
import { config } from "dotenv";
import { backfillAttendanceDates } from "@/domains/attendance/attendance-date-backfill";

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
  const jsonPath = flag("--json");
  if (process.argv.includes("--json") && !jsonPath) throw new Error("--json needs a file path");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  console.log(apply ? "APPLY: moving attendance records onto the organization's calendar day" : "DRY RUN: attendance records filed under the UTC day");
  const report = await backfillAttendanceDates({ apply, organizationId, log: (line) => console.log(`  ${line}`) });
  if (jsonPath) writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  console.log(
    `${apply ? "Done" : "Dry run"}. Scanned: ${report.scanned}. Already correct: ${report.alreadyCorrect}. Without a check-in (left alone): ${report.withoutCheckIn}. ` +
      `To move: ${report.toMove}. Moved: ${report.moved}. Collisions (left alone): ${report.collisions.length}.` +
      (apply ? "" : " Re-run with --apply to move them."),
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
