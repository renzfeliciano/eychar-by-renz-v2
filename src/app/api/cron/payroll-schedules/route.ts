import { NextRequest, NextResponse } from "next/server";
import { PayrollScheduleService } from "@/domains/payroll/payroll-schedule-service";
import { toErrorResponse } from "@/shared/errors/to-response";
import { checkCronAuthorization } from "@/server/security/cron-auth";

/**
 * Daily cron (Vercel Cron, or any scheduler sending
 * `Authorization: Bearer $CRON_SECRET`): prepares the draft run for every
 * payroll schedule whose cutoff has closed, across organizations. Off until
 * CRON_SECRET is set; the payroll screen also catches up on each visit.
 * Each call prepares at most a few runs (PREPARE_LIMIT_PER_PASS) to stay
 * inside the function's time limit; `remaining` says how many due schedules
 * were left for the next pass (the next day's cron, or a payroll page visit).
 */
export async function GET(request: NextRequest) {
  const auth = checkCronAuthorization(request.headers.get("authorization"));
  if (auth === "unconfigured") return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
  if (auth === "unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { outcomes, remaining } = await PayrollScheduleService.prepareDueBatch();
    return NextResponse.json({ outcomes, remaining });
  } catch (error) {
    return toErrorResponse(error);
  }
}
