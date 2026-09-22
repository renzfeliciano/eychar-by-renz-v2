import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/employee-accounts/[id]/webauthn">) {
  try {
    const { id } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", organizationId);
    const result = await WebAuthnService.resetCredentials(id, organizationId, { userId });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
