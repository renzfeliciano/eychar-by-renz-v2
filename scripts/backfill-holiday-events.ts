/**
 * Puts holiday-category events saved before ADR-049 on the holiday calendar:
 * gives each one a holiday type and adds its linked Holiday, exactly as
 * editing the event would. See src/domains/events/holiday-event-backfill.ts.
 *
 *   npx tsx scripts/backfill-holiday-events.ts                                  # dry run: lists the events
 *   npx tsx scripts/backfill-holiday-events.ts --apply --type special_non_working
 *   ... --org <organizationId>                                                   # only one organization
 *
 * --type is one of: regular, special_non_working, special_working. Every
 * event found gets the same type; set a different one afterwards by editing
 * that event on the company calendar. A day already on the holiday calendar
 * under the same name isn't added twice. Needs MONGODB_URI (from .env.local /
 * .env or the environment). Idempotent: an event that has a type is skipped.
 */
import mongoose from "mongoose";
import { config } from "dotenv";
import { backfillHolidayEvents } from "@/domains/events/holiday-event-backfill";
import { HOLIDAY_TYPES, type HolidayType } from "@/domains/holidays/holiday-types";

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
  const type = flag("--type");
  if (type !== undefined && !(HOLIDAY_TYPES as readonly string[]).includes(type)) throw new Error(`--type must be one of: ${HOLIDAY_TYPES.join(", ")}`);
  if (apply && !type) throw new Error(`--apply needs --type (one of: ${HOLIDAY_TYPES.join(", ")})`);
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  console.log(apply ? `APPLY: giving holiday events without a type the type "${type}"` : "DRY RUN: holiday events without a holiday type");
  const counts = await backfillHolidayEvents({ apply, holidayType: type as HolidayType | undefined, organizationId, log: (line) => console.log(`  ${line}`) });

  console.log(
    apply
      ? `Done. Events: ${counts.found}. Updated: ${counts.updated}. Added to the holiday calendar: ${counts.added}. Already on it under the same name: ${counts.alreadyOnCalendar}.`
      : `Dry run. Events that would be updated: ${counts.found}. Re-run with --apply --type <type> to update them.`,
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
