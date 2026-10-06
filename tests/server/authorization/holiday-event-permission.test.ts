import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, OrganizationModel, PersonModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { EventCategoryService } from "@/domains/catalog/event-category-service";
import { HolidayService } from "@/domains/holidays/holiday-service";

const session = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => session() }));

const { POST } = await import("@/app/api/events/route");
const { PATCH, DELETE } = await import("@/app/api/events/[id]/route");

const EVENTS = ["events.read", "events.create", "events.update"];

async function userWith(organizationId: string, permissionKeys: string[]) {
  const person = await PersonModel.create({ organizationId, firstName: "Jo", lastName: "Lee" });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `E-${Date.now()}-${Math.random()}` });
  const user = await UserModel.create({ username: `ev.${Date.now()}.${Math.random()}`, passwordHash: "x", employeeId: employee._id });
  const role = await RoleModel.create({ organizationId, name: `R ${Math.random()}`, permissionKeys });
  await RoleAssignmentModel.create({ organizationId, roleId: role._id, userId: user._id });
  return user._id.toString();
}

async function seed() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-holiday-perm-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  await EventCategoryService.create({ organizationId, code: "meeting", name: "Meeting" }, {});
  await EventCategoryService.create({ organizationId, code: "holiday", name: "Holiday", metadata: { isHoliday: true } }, {});
  return {
    organizationId,
    eventsOnly: await userWith(organizationId, EVENTS),
    hr: await userWith(organizationId, [...EVENTS, "attendance.update"]),
  };
}

const signIn = (userId: string) => session.mockResolvedValue({ user: { id: userId } });
const json = (method: string, body: unknown) => new NextRequest("http://localhost/api/events", { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const meeting = (organizationId: string) => ({ organizationId, title: "Town hall", date: "2026-09-10", category: "meeting" });
const holiday = (organizationId: string) => ({ organizationId, title: "Founding day", date: "2026-09-10", category: "holiday", holidayType: "special_non_working" });
const september = (organizationId: string) => HolidayService.listBetween(organizationId, "2026-09-01", "2026-09-30");

async function created(response: Response): Promise<string> {
  expect(response.status).toBe(201);
  return ((await response.json()) as { event: { _id: string } }).event._id;
}

describe("Holiday events need the holiday-calendar permission (ADR-049)", () => {
  beforeEach(async () => {
    await connectMongoDB();
    session.mockReset();
  });

  it("lets someone with only event permissions add ordinary events, but not holidays", async () => {
    const { organizationId, eventsOnly } = await seed();
    signIn(eventsOnly);

    await created(await POST(json("POST", meeting(organizationId))));
    expect((await POST(json("POST", holiday(organizationId)))).status).toBe(403);
    expect(await september(organizationId)).toEqual([]);
  });

  it("lets HR add, edit and cancel a holiday event", async () => {
    const { organizationId, hr } = await seed();
    signIn(hr);

    const id = await created(await POST(json("POST", holiday(organizationId))));
    expect(await september(organizationId)).toEqual([expect.objectContaining({ name: "Founding day", eventId: id })]);

    expect((await PATCH(json("PATCH", { ...holiday(organizationId), date: "2026-09-11" }), ctx(id))).status).toBe(200);
    expect(await september(organizationId)).toEqual([expect.objectContaining({ date: "2026-09-11" })]);

    expect((await DELETE(json("DELETE", { organizationId }), ctx(id))).status).toBe(200);
    expect(await september(organizationId)).toEqual([]);
  });

  it("stops someone with only event permissions from changing, unmaking or cancelling a holiday event", async () => {
    const { organizationId, eventsOnly, hr } = await seed();
    signIn(hr);
    const id = await created(await POST(json("POST", holiday(organizationId))));

    signIn(eventsOnly);
    expect((await PATCH(json("PATCH", { ...holiday(organizationId), title: "Renamed" }), ctx(id))).status).toBe(403);
    expect((await PATCH(json("PATCH", { ...meeting(organizationId), title: "Founding day" }), ctx(id))).status).toBe(403);
    expect((await DELETE(json("DELETE", { organizationId }), ctx(id))).status).toBe(403);
    expect(await september(organizationId)).toEqual([expect.objectContaining({ name: "Founding day", eventId: id })]);
  });

  it("stops someone with only event permissions from turning an ordinary event into a holiday", async () => {
    const { organizationId, eventsOnly } = await seed();
    signIn(eventsOnly);
    const id = await created(await POST(json("POST", meeting(organizationId))));

    expect((await PATCH(json("PATCH", holiday(organizationId)), ctx(id))).status).toBe(403);
    expect(await september(organizationId)).toEqual([]);
  });

  it("returns 400 for a holiday type that isn't one of the known kinds", async () => {
    const { organizationId, hr } = await seed();
    signIn(hr);
    expect((await POST(json("POST", { ...holiday(organizationId), holidayType: "half_day" }))).status).toBe(400);
  });
});
