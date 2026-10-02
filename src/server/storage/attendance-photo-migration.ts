import { Types } from "mongoose";
import { AttendanceRecordModel } from "@/server/db/models";
import { AttendancePhotoStorage, decodeJpegDataUrl, putAttendancePhoto } from "./attendance-photo-storage";

/**
 * The backfill behind scripts/migrate-attendance-photos.ts: moves clock
 * photos still stored inline (`checkIn/checkOut.photo` data URLs) into
 * private Blob storage and unsets the inline copy. Kept here, not in the
 * script, so it can be tested with Blob mocked.
 *
 * Idempotent: a moved photo has no inline `photo` left, so it's never picked
 * up again. Each record update is conditional on the inline photo still
 * being the one that was uploaded, so a re-run or a concurrent write can't
 * clobber anything. A photo that fails to upload stays inline.
 */
const EVENTS = ["checkIn", "checkOut"] as const;

type Row = {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  employeeId: Types.ObjectId;
  checkIn?: { photo?: unknown };
  checkOut?: { photo?: unknown };
};

export type PhotoMigrationCounts = { records: number; photos: number; moved: number; invalid: number; failed: number; skipped: number };

export async function migrateInlineAttendancePhotos(options: {
  apply: boolean;
  batchSize?: number;
  /** Only this organization's records (default: all). */
  organizationId?: string;
  log?: (line: string) => void;
}): Promise<PhotoMigrationCounts> {
  const batchSize = options.batchSize ?? 100;
  const log = options.log ?? (() => undefined);
  const hasInline: Record<string, unknown> = {
    $or: EVENTS.map((event) => ({ [`${event}.photo`]: { $type: "string" } })),
    ...(options.organizationId ? { organizationId: new Types.ObjectId(options.organizationId) } : {}),
  };
  const counts: PhotoMigrationCounts = { records: 0, photos: 0, moved: 0, invalid: 0, failed: 0, skipped: 0 };
  let lastId: Types.ObjectId | null = null;

  for (;;) {
    // Keyset pagination on _id: stable while records are being rewritten,
    // and a dry run (which changes nothing) still walks every record once.
    const filter: Record<string, unknown> = lastId ? { $and: [hasInline, { _id: { $gt: lastId } }] } : hasInline;
    const batch = (await AttendanceRecordModel.collection
      .find(filter, { projection: { organizationId: 1, employeeId: 1, "checkIn.photo": 1, "checkOut.photo": 1 } })
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray()) as unknown as Row[];
    if (!batch.length) break;
    lastId = batch[batch.length - 1]._id;

    for (const row of batch) {
      counts.records += 1;
      for (const event of EVENTS) {
        const photo = row[event]?.photo;
        if (typeof photo !== "string" || !photo) continue;
        counts.photos += 1;

        let bytes: Uint8Array;
        try {
          bytes = decodeJpegDataUrl(photo);
        } catch {
          counts.invalid += 1;
          log(`  ${row._id} ${event}: inline photo isn't a JPEG data URL, left as is`);
          continue;
        }
        if (!options.apply) continue;

        try {
          const key = await putAttendancePhoto(row.organizationId.toString(), row.employeeId.toString(), bytes);
          const result = await AttendanceRecordModel.collection.updateOne(
            { _id: row._id, [`${event}.photo`]: photo },
            { $set: { [`${event}.photoStorage`]: { provider: "vercel-blob", key } }, $unset: { [`${event}.photo`]: "" } },
          );
          if (result.modifiedCount === 1) {
            counts.moved += 1;
          } else {
            // Changed underneath us: leave the record alone and drop the unreferenced upload.
            counts.skipped += 1;
            await AttendancePhotoStorage.remove({ photoStorage: { provider: "vercel-blob", key } }).catch(() => undefined);
            log(`  ${row._id} ${event}: record changed during migration, skipped`);
          }
        } catch (error) {
          counts.failed += 1;
          log(`  ${row._id} ${event}: failed, left inline: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    log(`  processed ${counts.records} records, ${counts.photos} inline photos so far`);
  }
  return counts;
}
