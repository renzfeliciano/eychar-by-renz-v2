import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { StaffAccountService } from "@/domains/identity/staff-account-service";
import { createStaffAccountSchema } from "@/shared/validation/auth";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function POST(request: NextRequest) {
  try {
    const input = createStaffAccountSchema.parse(await request.json());
    const { userId } = await requirePermission("staff-accounts.create", input.organizationId);
    const user = await StaffAccountService.create(input, { userId });
    // Only safe fields: never the password hash or other secrets.
    return NextResponse.json({ user: StaffAccountService.toSummary(user) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
