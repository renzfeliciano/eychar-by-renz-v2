import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { AccountSecurityService } from "@/domains/identity/account-security-service";
import { accountAdminActionSchema } from "@/shared/validation/account";
import { toErrorResponse } from "@/shared/errors/to-response";

/**
 * An administrator acting on an account in their organization: reset its
 * password (returns a temporary one, shown once), unlock it, disable or
 * enable it, or clear its two-factor sign-in.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/users/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = accountAdminActionSchema.parse(await request.json());
    const { userId } = await requirePermission("users.update", input.organizationId);
    const actor = { userId };
    // The account must be this organization's alone, and not the Super
    // Administrator's (each service method checks this again).
    await AccountSecurityService.requireUserInOrganization(id, input.organizationId);
    await AccountSecurityService.assertCanAdminister(id, input.organizationId, actor);

    switch (input.action) {
      case "rename":
        await AccountSecurityService.rename(id, input.organizationId, { firstName: input.firstName ?? "", lastName: input.lastName ?? "" }, actor);
        break;
      case "reset-password":
        return NextResponse.json(await AccountSecurityService.resetPassword(id, input.organizationId, actor));
      case "unlock":
        await AccountSecurityService.unlock(id, input.organizationId, actor);
        break;
      case "disable":
      case "enable":
        await AccountSecurityService.setStatus(id, input.organizationId, input.action === "disable" ? "disabled" : "active", actor);
        break;
      case "reset-mfa":
        await AccountSecurityService.resetMfa(id, input.organizationId, actor);
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
