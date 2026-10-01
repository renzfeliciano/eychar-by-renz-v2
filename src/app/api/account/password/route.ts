import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AccountSecurityService } from "@/domains/identity/account-security-service";
import { changePasswordSchema } from "@/shared/validation/auth";
import { toErrorResponse } from "@/shared/errors/to-response";

/** The signed-in person changing their own password (also how a temporary password is replaced). */
export async function POST(request: Request) {
  try {
    // The one route an account on a temporary password may use.
    const { userId } = await requireAuthenticatedUser({ allowPendingPasswordChange: true, allowPendingTwoStepSetup: true });
    const input = changePasswordSchema.parse(await request.json());
    // The change ends this session too; the form signs in again with `login`.
    const { login } = await AccountSecurityService.changePassword(userId, input);
    return NextResponse.json({ ok: true, login });
  } catch (error) {
    return toErrorResponse(error);
  }
}
