import { NextRequest, NextResponse } from "next/server";
import { requireSelfServiceEmployee } from "@/server/authorization";
import { SelfServiceAttendanceService } from "@/domains/attendance/self-service-attendance-service";
import { selfServiceClockInSchema } from "@/shared/validation/attendance";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function POST(request: NextRequest) {
  try {
    const { userId, employeeId, organizationId } = await requireSelfServiceEmployee();
    const input = selfServiceClockInSchema.parse(await request.json());
    const record = await SelfServiceAttendanceService.checkIn(employeeId, organizationId, userId, input, { userId });
    // Not the whole record — that would echo the just-uploaded photo back.
    return NextResponse.json({ record: { checkInAt: record.checkInAt, status: record.status } }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
