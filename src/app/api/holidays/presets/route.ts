import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { HolidayService } from "@/domains/holidays/holiday-service";
import { holidayPresetQuerySchema, importHolidayPresetSchema } from "@/shared/validation/holidays";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Preview a country's holidays for a year (nothing is saved). */
export async function GET(request: NextRequest) {
  try {
    const { organizationId, preset, year } = holidayPresetQuerySchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
      preset: request.nextUrl.searchParams.get("preset"),
      year: request.nextUrl.searchParams.get("year"),
    });
    await requirePermission("attendance.update", organizationId);
    const preview = await HolidayService.previewPreset(organizationId, preset, year);
    return NextResponse.json({ preview });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Save the days HR picked from the preview. */
export async function POST(request: NextRequest) {
  try {
    const input = importHolidayPresetSchema.parse(await request.json());
    const { userId } = await requirePermission("attendance.update", input.organizationId);
    const result = await HolidayService.importPreset(input, { userId });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
