import { describe, it, expect, vi, afterEach } from "vitest";

const put = vi.fn();
const get = vi.fn();
const del = vi.fn();
vi.mock("@vercel/blob", () => ({ put: (...args: unknown[]) => put(...args), get: (...args: unknown[]) => get(...args), del: (...args: unknown[]) => del(...args) }));

const { DocumentStorage } = await import("@/server/storage/document-storage");
const BYTES = new Uint8Array(Buffer.from("%PDF-1.4 hello"));

describe("DocumentStorage", () => {
  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("keeps files inline when no Blob store is configured", async () => {
    const result = await DocumentStorage.save({ organizationId: "o", employeeId: "e", bytes: BYTES, contentType: "application/pdf" });
    expect(result).toEqual({ stored: { provider: "inline" }, inlineData: Buffer.from(BYTES).toString("base64") });
    expect(put).not.toHaveBeenCalled();
    expect(Buffer.from((await DocumentStorage.read({ fileData: result.inlineData }))!).equals(Buffer.from(BYTES))).toBe(true);
  });

  it("stores files as private blobs under a key with no file name in it", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    put.mockImplementation(async (pathname: string) => ({ pathname }));
    const result = await DocumentStorage.save({ organizationId: "org1", employeeId: "emp1", bytes: BYTES, contentType: "application/pdf" });

    expect(result.inlineData).toBeUndefined();
    expect(result.stored.provider).toBe("vercel-blob");
    const [pathname, , options] = put.mock.calls[0];
    expect(pathname).toMatch(/^employee-documents\/org1\/emp1\/[0-9a-f-]{36}$/);
    expect(options).toMatchObject({ access: "private", contentType: "application/pdf", addRandomSuffix: false });

    get.mockResolvedValue({ stream: new Response(Buffer.from(BYTES)).body });
    const bytes = await DocumentStorage.read({ storage: result.stored });
    expect(Buffer.from(bytes!).equals(Buffer.from(BYTES))).toBe(true);
    expect(get).toHaveBeenCalledWith(pathname, expect.objectContaining({ access: "private" }));

    await DocumentStorage.remove({ storage: result.stored });
    expect(del).toHaveBeenCalledWith(pathname);
  });

  it("reports a missing blob as no file", async () => {
    get.mockResolvedValue(null);
    expect(await DocumentStorage.read({ storage: { provider: "vercel-blob", key: "employee-documents/x" } })).toBeNull();
  });
});
