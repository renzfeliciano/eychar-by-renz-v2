import { NextResponse } from "next/server";
import { requireSelfServiceEmployee } from "@/server/authorization";
import { SelfServiceAttendanceService } from "@/domains/attendance/self-service-attendance-service";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Today's record (if any) plus whether a biometric device is registered — what the clock page needs on load. */
export async function GET() {
  try {
    const { userId, employeeId, organizationId } = await requireSelfServiceEmployee();
    const [today, hasCredential] = await Promise.all([
      SelfServiceAttendanceService.getTodayRecord(employeeId, organizationId),
      WebAuthnService.hasRegisteredCredential(userId),
    ]);
    return NextResponse.json({ today, hasCredential });
  } catch (error) {
    return toErrorResponse(error);
  }
}
