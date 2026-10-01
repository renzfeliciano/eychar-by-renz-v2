import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { SecuritySettingsService } from "@/domains/identity/security-settings-service";
import { AuthenticationError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";

const bodySchema = z.object({
  organizationId: z.string().trim().min(1),
  idleTimeoutSeconds: z.number().int(),
  idleWarningSeconds: z.number().int(),
});

/** Updates the session rules (the service enforces Super Administrator only). */
export async function PUT(request: NextRequest) {
  try {
    const { organizationId, ...input } = bodySchema.parse(await request.json());
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw new AuthenticationError();
    return NextResponse.json({ settings: await SecuritySettingsService.update(organizationId, input, { userId: session.user.id }) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
