import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EventService } from "@/domains/events/event-service";
import { updateEventSchema, cancelEventSchema } from "@/shared/validation/events";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/events/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateEventSchema.parse(await request.json());
    const { userId } = await requirePermission("events.update", input.organizationId);
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
    const event = await EventService.cancel(id, input.organizationId, { userId });
    return NextResponse.json({ event });
  } catch (error) {
    return toErrorResponse(error);
  }
}
