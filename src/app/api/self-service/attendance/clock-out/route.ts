import { NextRequest, NextResponse } from "next/server";
import { requireSelfServiceEmployee } from "@/server/authorization";
import { SelfServiceAttendanceService } from "@/domains/attendance/self-service-attendance-service";
import { selfServiceClockOutSchema } from "@/shared/validation/attendance";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function POST(request: NextRequest) {
  try {
    const { userId, employeeId, organizationId } = await requireSelfServiceEmployee();
    const input = selfServiceClockOutSchema.parse(await request.json());
    const record = await SelfServiceAttendanceService.checkOut(employeeId, organizationId, userId, input, { userId });
    // Not the whole record — that would echo both clock photos back.
    return NextResponse.json({ record: { checkInAt: record.checkInAt, checkOutAt: record.checkOutAt, status: record.status } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
