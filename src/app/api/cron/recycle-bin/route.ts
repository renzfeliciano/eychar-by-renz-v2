import { NextRequest, NextResponse } from "next/server";
import { DeletionService } from "@/domains/deletion/deletion-service";
import { toErrorResponse } from "@/shared/errors/to-response";
import { checkCronAuthorization } from "@/server/security/cron-auth";

/**
 * Daily cron (`Authorization: Bearer $CRON_SECRET`): purges recycle-bin
 * entries past their 30 days, across organizations. The Recycle bin page
 * also purges expired entries each time it's opened.
 */
export async function GET(request: NextRequest) {
  const auth = checkCronAuthorization(request.headers.get("authorization"));
  if (auth === "unconfigured") return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
  if (auth === "unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ purged: await DeletionService.purgeExpired() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
