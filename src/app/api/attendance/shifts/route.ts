import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ShiftTemplateService } from "@/domains/attendance/shift-template-service";
import { createShiftTemplateSchema } from "@/shared/validation/schedule";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

// Schedules reuse the attendance permission keys (ADR-027): whoever can
// view attendance can view schedules; whoever can adjust it can plan them.
export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({ organizationId: request.nextUrl.searchParams.get("organizationId") });
    await requirePermission("attendance.read", organizationId);
    const shifts = await ShiftTemplateService.listCurrent(organizationId);
    return NextResponse.json({ shifts });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createShiftTemplateSchema.parse(await request.json());
    const { userId } = await requirePermission("attendance.update", input.organizationId);
    const shift = await ShiftTemplateService.create(input, { userId });
    return NextResponse.json({ shift }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
