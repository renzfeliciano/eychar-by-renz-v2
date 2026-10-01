import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/server/authorization";
import { SecuritySettingsService } from "@/domains/identity/security-settings-service";
import { toErrorResponse } from "@/shared/errors/to-response";
import { objectId } from "@/shared/validation/object-id";

const bodySchema = z.object({
  organizationId: objectId(),
  idleTimeoutSeconds: z.number().int(),
  idleWarningSeconds: z.number().int(),
  requireTwoStepForStaff: z.boolean().optional(),
});

/** Updates the session rules (the service enforces Super Administrator only). */
export async function PUT(request: NextRequest) {
  try {
    const { organizationId, ...input } = bodySchema.parse(await request.json());
    const { userId } = await requireAuthenticatedUser();
    return NextResponse.json({ settings: await SecuritySettingsService.update(organizationId, input, { userId }) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
