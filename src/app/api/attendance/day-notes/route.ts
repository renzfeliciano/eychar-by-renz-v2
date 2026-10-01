import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { DayNoteService } from "@/domains/holidays/day-note-service";
import { saveDayNoteSchema } from "@/shared/validation/holidays";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Sets (or, with an empty note, clears) HR's note on one calendar day. */
export async function PUT(request: NextRequest) {
  try {
    const input = saveDayNoteSchema.parse(await request.json());
    const { userId } = await requirePermission("attendance.update", input.organizationId);
    const result = await DayNoteService.save(input, { userId });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
