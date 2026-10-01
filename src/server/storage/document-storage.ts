import { randomUUID } from "crypto";
import { del, get, put } from "@vercel/blob";

/**
 * Where an employee document's file lives (ADR-038). Files go to private
 * object storage (Vercel Blob) when BLOB_READ_WRITE_TOKEN is set, so the
 * database only holds metadata. Without it (local dev, tests, or a deploy
 * that hasn't added a Blob store yet) they're kept inline in MongoDB as
 * before, and documents stored that way keep working after the switch.
 *
 * Blobs are created `private`: they can't be fetched by URL, only through
 * the permission-checked download route, which streams them from here.
 */
export type StoredFile = { provider: "vercel-blob"; key: string } | { provider: "inline" };

export type FileLocation = { storage?: { provider?: string | null; key?: string | null } | null; fileData?: string | null };

export function objectStorageEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Keys never contain the file name or anything personal: org / employee / random id. */
function blobKey(organizationId: string, employeeId: string): string {
  return `employee-documents/${organizationId}/${employeeId}/${randomUUID()}`;
}

export const DocumentStorage = {
  /** Stores the file and says where; for `inline`, the caller saves `inlineData` on the document. */
  async save(input: { organizationId: string; employeeId: string; bytes: Uint8Array; contentType: string }): Promise<{ stored: StoredFile; inlineData?: string }> {
    if (!objectStorageEnabled()) return { stored: { provider: "inline" }, inlineData: Buffer.from(input.bytes).toString("base64") };
    const result = await put(blobKey(input.organizationId, input.employeeId), Buffer.from(input.bytes), {
      access: "private",
      contentType: input.contentType,
      addRandomSuffix: false,
    });
    return { stored: { provider: "vercel-blob", key: result.pathname } };
  },

  /** The file's bytes, from wherever they were stored. `null` when they're gone. */
  async read(location: FileLocation): Promise<Uint8Array | null> {
    if (location.storage?.provider === "vercel-blob" && location.storage.key) {
      const result = await get(location.storage.key, { access: "private", useCache: false });
      if (!result || !result.stream) return null;
      return new Uint8Array(await new Response(result.stream).arrayBuffer());
    }
    return location.fileData ? Buffer.from(location.fileData, "base64") : null;
  },

  /** Removes a stored blob (inline files go with their document). Missing blobs are fine. */
  async remove(location: FileLocation): Promise<void> {
    if (location.storage?.provider === "vercel-blob" && location.storage.key) await del(location.storage.key);
  },
};
