import { NextResponse } from "next/server";
import { authorize, requirePermission } from "@/server/authorization";
import { EventService } from "@/domains/events/event-service";
import { HOLIDAY_CALENDAR_PERMISSION } from "@/domains/holidays/holiday-types";
import { updateEventSchema, cancelEventSchema } from "@/shared/validation/events";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/events/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateEventSchema.parse(await request.json());
    const { userId } = await requirePermission("events.update", input.organizationId);
    // Making, changing or unmaking a holiday event changes the holiday calendar (ADR-049).
    if (await EventService.touchesHolidayCalendar(input.organizationId, { eventId: id, category: input.category })) {
      await authorize({ userId, organizationId: input.organizationId, permission: HOLIDAY_CALENDAR_PERMISSION });
    }
    const event = await EventService.update(id, input.organizationId, input, { userId });
    return NextResponse.json({ event });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/events/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = cancelEventSchema.parse(await request.json());
    const { userId } = await requirePermission("events.update", input.organizationId);
    // Cancelling a holiday event takes its day off the holiday calendar (ADR-049).
    if (await EventService.touchesHolidayCalendar(input.organizationId, { eventId: id })) {
      await authorize({ userId, organizationId: input.organizationId, permission: HOLIDAY_CALENDAR_PERMISSION });
    }
    const event = await EventService.cancel(id, input.organizationId, { userId });
    return NextResponse.json({ event });
  } catch (error) {
    return toErrorResponse(error);
  }
}
