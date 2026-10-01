import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { VisibilityService } from "@/domains/visibility/visibility-service";
import { AuthenticationError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";

const bodySchema = z.object({ organizationId: z.string().trim().min(1), type: z.string().trim().min(1), id: z.string().trim().min(1), hidden: z.boolean() });

/** Hides or unhides a record as test data (the service enforces Super Administrator only, ADR-034). */
export async function POST(request: NextRequest) {
  try {
    const input = bodySchema.parse(await request.json());
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw new AuthenticationError();
    return NextResponse.json(await VisibilityService.setHidden(input.type, input.id, input.organizationId, input.hidden, { userId: session.user.id }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
