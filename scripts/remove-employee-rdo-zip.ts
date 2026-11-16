/**
 * Clears the employee RDO code and ZIP code that were stored on Person records before HR removed
 * those fields (they are no longer part of the employee information). The employer's own RDO and
 * ZIP (Organization settings) are not touched.
 *
 *   npx tsx scripts/remove-employee-rdo-zip.ts            # dry run: report only
 *   npx tsx scripts/remove-employee-rdo-zip.ts --apply    # unset both fields
 *
 * Idempotent: a second --apply finds nothing. Reads the raw collection, because the Person schema
 * no longer has these paths and Mongoose would drop them from an update. Needs MONGODB_URI (from
 * .env.local / .env or the environment). Run the dry run first, and on a copy of the data.
 */
import mongoose from "mongoose";
import { config } from "dotenv";
import { removeEmployeeRdoZip } from "@/domains/people/remove-employee-rdo-zip";

config({ path: ".env.local", override: true });
config({ path: ".env" });

async function main() {
  const apply = process.argv.includes("--apply");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  const result = await removeEmployeeRdoZip({ apply });
  console.log(
    apply
      ? `Done. Person records that held an RDO or ZIP: ${result.found}. Cleared: ${result.cleared}.`
      : `Dry run. Person records that hold an RDO or ZIP: ${result.found}. Re-run with --apply to clear them.`,
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
