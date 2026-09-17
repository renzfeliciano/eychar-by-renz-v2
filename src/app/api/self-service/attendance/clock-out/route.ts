import { NextRequest, NextResponse } from "next/server";
import { requireSelfServiceEmployee } from "@/server/authorization";
import { SelfServiceAttendanceService } from "@/domains/attendance/self-service-attendance-service";
import { selfServiceClockOutSchema } from "@/shared/validation/attendance";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function POST(request: NextRequest) {
  try {
    const { userId, employeeId, organizationId } = await requireSelfServiceEmployee();
    const input = selfServiceClockOutSchema.parse(await request.json());
    const record = await SelfServiceAttendanceService.checkOut(
      employeeId,
      organizationId,
      userId,
      { latitude: input.latitude, longitude: input.longitude, accuracy: input.accuracy, photo: input.photo, webAuthn: input.webAuthn },
      { userId },
    );
    return NextResponse.json({ record });
  } catch (error) {
    return toErrorResponse(error);
  }
}
