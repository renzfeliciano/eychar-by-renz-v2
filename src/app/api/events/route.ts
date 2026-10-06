import { NextRequest, NextResponse } from "next/server";
import { authorize, requirePermission } from "@/server/authorization";
import { EventService } from "@/domains/events/event-service";
import { HOLIDAY_CALENDAR_PERMISSION } from "@/domains/holidays/holiday-types";
import { createEventSchema, eventMonthQuerySchema } from "@/shared/validation/events";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId, month } = eventMonthQuerySchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
      month: request.nextUrl.searchParams.get("month"),
    });
    await requirePermission("events.read", organizationId);
    const events = await EventService.listForMonth(organizationId, month);
    return NextResponse.json({ events });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createEventSchema.parse(await request.json());
    const { userId } = await requirePermission("events.create", input.organizationId);
    // A holiday event also puts the day on the holiday calendar (ADR-049).
    if (await EventService.touchesHolidayCalendar(input.organizationId, { category: input.category })) {
      await authorize({ userId, organizationId: input.organizationId, permission: HOLIDAY_CALENDAR_PERMISSION });
    }
    const event = await EventService.create(input, { userId });
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
