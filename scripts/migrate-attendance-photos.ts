/**
 * Moves self-service clock-in/out photos still stored inline (base64 data
 * URLs on AttendanceRecord.checkIn/checkOut.photo) into private Vercel Blob
 * storage, then unsets the inline copy (ADR-038, applied to attendance).
 *
 *   npx tsx scripts/migrate-attendance-photos.ts           # dry run: counts only
 *   npx tsx scripts/migrate-attendance-photos.ts --apply   # uploads and updates
 *   ... --org <organizationId>                              # only one organization
 *
 * Needs MONGODB_URI and BLOB_READ_WRITE_TOKEN (from .env.local / .env or the
 * environment). Idempotent and safe to re-run: see
 * src/server/storage/attendance-photo-migration.ts. Processes 100 records
 * per batch. A photo that fails to upload is left inline and reported, and
 * the script exits non-zero so it can simply be run again.
 */
import mongoose from "mongoose";
import { config } from "dotenv";
import { migrateInlineAttendancePhotos } from "@/server/storage/attendance-photo-migration";

config({ path: ".env.local", override: true });
config({ path: ".env" });

async function main() {
  const apply = process.argv.includes("--apply");
  const orgFlag = process.argv.indexOf("--org");
  const organizationId = orgFlag >= 0 ? process.argv[orgFlag + 1] : undefined;
  if (orgFlag >= 0 && !(organizationId && mongoose.Types.ObjectId.isValid(organizationId))) throw new Error("--org needs an organization id");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set: connect a Vercel Blob store first. Refusing to run (photos would have nowhere to go).");
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  console.log(`${apply ? "APPLY" : "DRY RUN"}: moving inline attendance photos to Vercel Blob (batches of 100)`);
  const counts = await migrateInlineAttendancePhotos({ apply, batchSize: 100, organizationId, log: (line) => console.log(line) });

  console.log(
    apply
      ? `Done. Records: ${counts.records}. Inline photos: ${counts.photos}. Moved: ${counts.moved}. Invalid (left as is): ${counts.invalid}. Failed (left inline): ${counts.failed}. Skipped: ${counts.skipped}.`
      : `Dry run. Records with inline photos: ${counts.records}. Photos that would move: ${counts.photos - counts.invalid}. Invalid (left as is): ${counts.invalid}. Re-run with --apply to move them.`,
  );
  await mongoose.disconnect();
  if (counts.failed) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
