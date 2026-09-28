import { NextRequest, NextResponse } from "next/server";
import { PayrollScheduleService } from "@/domains/payroll/payroll-schedule-service";
import { toErrorResponse } from "@/shared/errors/to-response";

/**
 * Daily cron (Vercel Cron, or any scheduler sending
 * `Authorization: Bearer $CRON_SECRET`): prepares the draft run for every
 * payroll schedule whose cutoff has closed, across organizations. Off until
 * CRON_SECRET is set; the payroll screen also catches up on each visit.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const outcomes = await PayrollScheduleService.prepareDue();
    return NextResponse.json({ outcomes });
  } catch (error) {
    return toErrorResponse(error);
  }
}
