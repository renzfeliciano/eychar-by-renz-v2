import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AccountSecurityService } from "@/domains/identity/account-security-service";
import { changePasswordSchema } from "@/shared/validation/auth";
import { toErrorResponse } from "@/shared/errors/to-response";

/** The signed-in person changing their own password (also how a temporary password is replaced). */
export async function POST(request: Request) {
  try {
    const { userId } = await requireAuthenticatedUser();
    const input = changePasswordSchema.parse(await request.json());
    await AccountSecurityService.changePassword(userId, input);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
