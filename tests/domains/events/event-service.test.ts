import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel } from "@/server/db/models";
import { EventService } from "@/domains/events/event-service";
import { EventCategoryService } from "@/domains/catalog/event-category-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

describe("EventService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates an event on a given date", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-event-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();

    const event = await EventService.create(
      { organizationId: orgId, title: "Town hall meeting", date: new Date("2026-03-15"), time: "09:00", category: "meeting", description: "Bring your own laptop" },
      {},
    );

    expect(event.title).toBe("Town hall meeting");
    expect(event.status).toBe("active");
  });

  it("rejects a category that doesn't match the organization's configured catalog", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-event-bad-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    await EventCategoryService.create({ organizationId: orgId, code: "meeting", name: "Meeting" }, {});

    await expect(
      EventService.create({ organizationId: orgId, title: "Bad event", date: new Date("2026-03-15"), category: "not-real" }, {}),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("fully updates an event", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-event-update-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const event = await EventService.create(
      { organizationId: orgId, title: "Meeting", date: new Date("2026-03-15"), category: "meeting" },
      {},
    );

    const updated = await EventService.update(
      event._id.toString(),
      orgId,
      { title: "Meeting (rescheduled)", date: new Date("2026-03-16"), category: "meeting", description: "Moved a day later" },
      {},
    );

    expect(updated.title).toBe("Meeting (rescheduled)");
    expect(updated.description).toBe("Moved a day later");
  });

  it("cancels an event and rejects cancelling it twice", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-event-cancel-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const event = await EventService.create(
      { organizationId: orgId, title: "Meeting", date: new Date("2026-03-15"), category: "meeting" },
      {},
    );

    const cancelled = await EventService.cancel(event._id.toString(), orgId, {});
    expect(cancelled.status).toBe("cancelled");

    await expect(EventService.cancel(event._id.toString(), orgId, {})).rejects.toThrow(BusinessRuleError);
  });

  it("lists only active events within a given month, excluding cancelled ones and other months", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-event-month-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const inMonth = await EventService.create(
      { organizationId: orgId, title: "In March", date: new Date("2026-03-15"), category: "meeting" },
      {},
    );
    await EventService.create({ organizationId: orgId, title: "In April", date: new Date("2026-04-01"), category: "meeting" }, {});
    const toCancel = await EventService.create(
      { organizationId: orgId, title: "Cancelled meeting", date: new Date("2026-03-20"), category: "meeting" },
      {},
    );
    await EventService.cancel(toCancel._id.toString(), orgId, {});

    const events = await EventService.listForMonth(orgId, "2026-03");
    expect(events).toHaveLength(1);
    expect(events[0]._id.toString()).toBe(inMonth._id.toString());
  });

  it("throws NotFoundError when updating an event in a different organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-event-org-${Date.now()}-${Math.random()}` });
    const otherOrg = await OrganizationModel.create({ name: "Other", slug: `other-event-${Date.now()}-${Math.random()}` });
    const event = await EventService.create(
      { organizationId: organization._id.toString(), title: "Meeting", date: new Date("2026-03-15"), category: "meeting" },
      {},
    );

    await expect(
      EventService.update(event._id.toString(), otherOrg._id.toString(), { title: "Hijacked", date: new Date("2026-03-15"), category: "meeting" }, {}),
    ).rejects.toThrow(NotFoundError);
  });
});
