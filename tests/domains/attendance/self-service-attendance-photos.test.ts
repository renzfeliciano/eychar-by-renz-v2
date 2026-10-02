import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

// Stands in for Vercel Blob, the same way tests/server/storage/document-storage.test.ts does.
const put = vi.fn();
const get = vi.fn();
const del = vi.fn();
vi.mock("@vercel/blob", () => ({ put: (...args: unknown[]) => put(...args), get: (...args: unknown[]) => get(...args), del: (...args: unknown[]) => del(...args) }));

const { connectMongoDB } = await import("@/server/db/connection");
const { OrganizationModel, PersonModel, EmployeeModel, LocationModel, ProjectModel, AttendanceRecordModel } = await import("@/server/db/models");
const { SelfServiceAttendanceService } = await import("@/domains/attendance/self-service-attendance-service");
const { AttendanceService } = await import("@/domains/attendance/attendance-service");
const { WebAuthnService } = await import("@/domains/identity/webauthn-service");
const { AttendancePhotoStorage } = await import("@/server/storage/attendance-photo-storage");
const { migrateInlineAttendancePhotos } = await import("@/server/storage/attendance-photo-migration");

const SITE = { latitude: 14.5547, longitude: 121.0244 };
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PHOTO = `data:image/jpeg;base64,${JPEG_BYTES.toString("base64")}`;

async function seed() {
  const suffix = `${Date.now()}-${Math.random()}`;
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-photos-${suffix}` });
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({ organizationId: organization._id, personId: person._id, employeeNumber: `EMP-P-${suffix}` });
  const location = await LocationModel.create({ organizationId: organization._id, name: "Site", code: `S-${suffix}`, ...SITE, geofenceRadiusMeters: 100 });
  const project = await ProjectModel.create({ organizationId: organization._id, name: "Project", code: `P-${suffix}`, locationId: location._id });
  return { organizationId: organization._id.toString(), employeeId: employee._id.toString(), projectId: project._id.toString() };
}

function clockData(overrides: Record<string, unknown> = {}) {
  return { ...SITE, accuracy: 10, photo: PHOTO, liveness: { challenges: ["blink" as const] }, webAuthn: {} as AuthenticationResponseJSON, ...overrides };
}

describe("Self-service clock photos (ADR-038 storage)", () => {
  beforeEach(async () => {
    await connectMongoDB();
    vi.spyOn(WebAuthnService, "verifyAuthentication").mockResolvedValue({ verified: true });
    put.mockImplementation(async (pathname: string) => ({ pathname }));
  });

  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("keeps the photo inline when no Blob store is configured", async () => {
    const { organizationId, employeeId, projectId } = await seed();
    const record = await SelfServiceAttendanceService.checkIn(employeeId, organizationId, "u", clockData({ projectId }), {});

    expect(put).not.toHaveBeenCalled();
    const stored = await AttendanceRecordModel.findById(record._id).lean();
    expect(stored?.checkIn?.photo).toBe(PHOTO);
    expect(stored?.checkIn?.photoStorage).toEqual({ provider: "inline" });
    expect(Buffer.from((await AttendancePhotoStorage.read(stored!.checkIn!))!).equals(JPEG_BYTES)).toBe(true);
  });

  it("stores check-in and check-out photos as private blobs and keeps no base64 in MongoDB", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const { organizationId, employeeId, projectId } = await seed();

    const record = await SelfServiceAttendanceService.checkIn(employeeId, organizationId, "u", clockData({ projectId }), {});
    await SelfServiceAttendanceService.checkOut(employeeId, organizationId, "u", clockData(), {});

    expect(put).toHaveBeenCalledTimes(2);
    for (const [pathname, body, options] of put.mock.calls) {
      expect(pathname).toMatch(new RegExp(`^attendance-photos/${organizationId}/${employeeId}/[0-9a-f-]{36}\\.jpg$`));
      expect(Buffer.from(body).equals(JPEG_BYTES)).toBe(true);
      expect(options).toMatchObject({ access: "private", contentType: "image/jpeg", addRandomSuffix: false });
    }

    const stored = await AttendanceRecordModel.findById(record._id).lean();
    expect(stored?.checkIn?.photo).toBeUndefined();
    expect(stored?.checkOut?.photo).toBeUndefined();
    expect(stored?.checkIn?.photoStorage).toEqual({ provider: "vercel-blob", key: put.mock.calls[0][0] });
    expect(stored?.checkOut?.photoStorage).toEqual({ provider: "vercel-blob", key: put.mock.calls[1][0] });

    get.mockResolvedValue({ stream: new Response(JPEG_BYTES).body });
    expect(Buffer.from((await AttendancePhotoStorage.read(stored!.checkIn!))!).equals(JPEG_BYTES)).toBe(true);
    expect(get).toHaveBeenCalledWith(put.mock.calls[0][0], expect.objectContaining({ access: "private" }));

    // Lists never carry the photo or its storage key.
    const [listed] = await AttendanceService.listForEmployee(employeeId, organizationId);
    expect(listed.checkIn?.photo).toBeUndefined();
    expect(listed.checkIn?.photoStorage).toBeUndefined();
  });

  it("removes the uploaded photo when a second clock-out loses the race", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const { organizationId, employeeId, projectId } = await seed();
    await SelfServiceAttendanceService.checkIn(employeeId, organizationId, "u", clockData({ projectId }), {});
    await SelfServiceAttendanceService.checkOut(employeeId, organizationId, "u", clockData(), {});
    // Simulates the second tab: its findOne saw no checkOutAt yet.
    const findOne = AttendanceRecordModel.findOne.bind(AttendanceRecordModel);
    vi.spyOn(AttendanceRecordModel, "findOne").mockImplementationOnce(((...args: Parameters<typeof findOne>) =>
      findOne(...args).then((doc: { checkOutAt?: Date } | null) => {
        if (doc) doc.checkOutAt = undefined;
        return doc;
      })) as never);

    await expect(SelfServiceAttendanceService.checkOut(employeeId, organizationId, "u", clockData(), {})).rejects.toThrow(/already clocked out/);
    expect(del).toHaveBeenCalledWith(put.mock.calls[2][0]);
  });

  it("refuses a photo whose bytes aren't a JPEG", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const { organizationId, employeeId, projectId } = await seed();
    const notJpeg = `data:image/jpeg;base64,${Buffer.from("<svg/>").toString("base64")}`;
    await expect(SelfServiceAttendanceService.checkIn(employeeId, organizationId, "u", clockData({ projectId, photo: notJpeg }), {})).rejects.toThrow(/photo/);
    expect(put).not.toHaveBeenCalled();
  });

  it("reads legacy records that only have an inline photo", async () => {
    expect(Buffer.from((await AttendancePhotoStorage.read({ photo: PHOTO }))!).equals(JPEG_BYTES)).toBe(true);
    expect(await AttendancePhotoStorage.read({})).toBeNull();
  });
  it("backfill: moves legacy inline photos to Blob, unsets the base64, and is idempotent (dry run changes nothing)", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const { organizationId, employeeId } = await seed();
    const legacy = await AttendanceRecordModel.create({
      organizationId,
      employeeId,
      date: new Date("2026-09-01"),
      status: "present",
      checkIn: { at: new Date("2026-09-01T00:00:00Z"), photo: PHOTO },
      checkOut: { at: new Date("2026-09-01T09:00:00Z"), photo: "data:image/jpeg;base64,PHN2Zy8+" }, // not a JPEG: left as is
    });

    await migrateInlineAttendancePhotos({ apply: false, batchSize: 2, organizationId });
    expect(put).not.toHaveBeenCalled();
    expect((await AttendanceRecordModel.findById(legacy._id).lean())?.checkIn?.photo).toBe(PHOTO);

    await migrateInlineAttendancePhotos({ apply: true, batchSize: 2, organizationId });
    const key = put.mock.calls.find(([pathname]) => String(pathname).startsWith(`attendance-photos/${organizationId}/${employeeId}/`))?.[0];
    expect(key).toBeTruthy();
    const migrated = await AttendanceRecordModel.findById(legacy._id).lean();
    expect(migrated?.checkIn?.photo).toBeUndefined();
    expect(migrated?.checkIn?.photoStorage).toEqual({ provider: "vercel-blob", key });
    expect(migrated?.checkOut?.photo).toBe("data:image/jpeg;base64,PHN2Zy8+");

    put.mockClear();
    await migrateInlineAttendancePhotos({ apply: true, batchSize: 2, organizationId });
    expect(put.mock.calls.some(([pathname]) => String(pathname).startsWith(`attendance-photos/${organizationId}/`))).toBe(false);
  });
});
