import { NextRequest, NextResponse } from "next/server";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { toErrorResponse } from "@/shared/errors/to-response";
import { checkCronAuthorization } from "@/server/security/cron-auth";

/**
 * Daily cron (Vercel Cron, or any scheduler sending `Authorization: Bearer $CRON_SECRET`): applies every
 * employment end scheduled for a last working day before today (payroll plan Phase 5a slice 3), across
 * organizations. Off until CRON_SECRET is set; the People screen also catches up on each visit.
 */
export async function GET(request: NextRequest) {
  const auth = checkCronAuthorization(request.headers.get("authorization"));
  if (auth === "unconfigured") return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
  if (auth === "unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const applied = await EmploymentService.applyDueScheduledEnds();
    return NextResponse.json({ applied });
  } catch (error) {
    return toErrorResponse(error);
  }
}
