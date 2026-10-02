import { randomUUID } from "crypto";
import { del, get, put } from "@vercel/blob";
import { objectStorageEnabled } from "./document-storage";
import { ValidationError } from "@/shared/errors";

/**
 * Where a self-service clock-in/out photo lives (ADR-038, applied to
 * attendance). Same seam and same rule as employee documents: with
 * BLOB_READ_WRITE_TOKEN set the JPEG goes to a private Vercel Blob and the
 * database keeps only `photoStorage`; without it the data URL stays inline
 * in `photo` as before. Records written before this change have `photo` and
 * no `photoStorage`, and read the same way.
 *
 * Kept apart from DocumentStorage so the documents' key layout and
 * behaviour stay exactly as they are.
 */
export type PhotoStorage = { provider: "vercel-blob"; key: string } | { provider: "inline" };

/** A clock event as stored: legacy/inline `photo`, or a `photoStorage` pointer. */
export type PhotoLocation = { photo?: string | null; photoStorage?: { provider?: string | null; key?: string | null } | null };

const DATA_URL_PREFIX = "data:image/jpeg;base64,";

/** Decodes a `data:image/jpeg;base64,…` URL, refusing anything that isn't a JPEG by its own bytes. */
export function decodeJpegDataUrl(dataUrl: string): Uint8Array {
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) throw new ValidationError("A live camera photo is required");
  const bytes = Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), "base64");
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new ValidationError("A live camera photo is required");
  return new Uint8Array(bytes);
}

/** Keys hold nothing personal beyond the ids the documents use: org / employee / random id. */
export function attendancePhotoKey(organizationId: string, employeeId: string): string {
  return `attendance-photos/${organizationId}/${employeeId}/${randomUUID()}.jpg`;
}

export async function putAttendancePhoto(organizationId: string, employeeId: string, bytes: Uint8Array): Promise<string> {
  const result = await put(attendancePhotoKey(organizationId, employeeId), Buffer.from(bytes), {
    access: "private",
    contentType: "image/jpeg",
    addRandomSuffix: false,
  });
  return result.pathname;
}

export const AttendancePhotoStorage = {
  /**
   * Stores the photo and returns the fields to put on the clock event:
   * `{ photoStorage }` only when it went to Blob, `{ photo, photoStorage }`
   * when it stays inline.
   */
  async save(input: { organizationId: string; employeeId: string; dataUrl: string }): Promise<{ photo?: string; photoStorage: PhotoStorage }> {
    const bytes = decodeJpegDataUrl(input.dataUrl);
    if (!objectStorageEnabled()) return { photo: input.dataUrl, photoStorage: { provider: "inline" } };
    const key = await putAttendancePhoto(input.organizationId, input.employeeId, bytes);
    return { photoStorage: { provider: "vercel-blob", key } };
  },

  /** The JPEG's bytes, from Blob or the inline data URL. `null` when there's no photo. */
  async read(location: PhotoLocation): Promise<Uint8Array | null> {
    if (location.photoStorage?.provider === "vercel-blob" && location.photoStorage.key) {
      const result = await get(location.photoStorage.key, { access: "private", useCache: false });
      if (!result || !result.stream) return null;
      return new Uint8Array(await new Response(result.stream).arrayBuffer());
    }
    if (!location.photo) return null;
    try {
      return decodeJpegDataUrl(location.photo);
    } catch {
      return null;
    }
  },

  /** Removes a stored blob (inline photos go with their record). Missing blobs are fine. */
  async remove(location: PhotoLocation): Promise<void> {
    if (location.photoStorage?.provider === "vercel-blob" && location.photoStorage.key) await del(location.photoStorage.key);
  },
};
