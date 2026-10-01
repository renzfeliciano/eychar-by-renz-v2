import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { HolidayService } from "@/domains/holidays/holiday-service";
import { createHolidaySchema, holidayYearQuerySchema } from "@/shared/validation/holidays";
import { toErrorResponse } from "@/shared/errors/to-response";

// Holidays sit with attendance permissions for now (they're read and kept
// on the Schedules screen): attendance.read to see, attendance.update to change.
export async function GET(request: NextRequest) {
  try {
    const { organizationId, year } = holidayYearQuerySchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
      year: request.nextUrl.searchParams.get("year"),
    });
    await requirePermission("attendance.read", organizationId);
    const holidays = await HolidayService.listForYear(organizationId, year);
    return NextResponse.json({ holidays });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createHolidaySchema.parse(await request.json());
    const { userId } = await requirePermission("attendance.update", input.organizationId);
    const holiday = await HolidayService.create(input, { userId });
    return NextResponse.json({ holiday }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
