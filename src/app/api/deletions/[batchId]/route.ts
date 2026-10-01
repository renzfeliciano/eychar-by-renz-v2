import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { DeletionService } from "@/domains/deletion/deletion-service";
import { AuthenticationError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";
import { objectId } from "@/shared/validation/object-id";

const bodySchema = z.object({ organizationId: objectId(), action: z.enum(["restore", "purge"]) });

/** Restore a recycle-bin entry, or purge it for good now. Super Administrator only (checked in the service). */
export async function POST(request: Request, ctx: RouteContext<"/api/deletions/[batchId]">) {
  try {
    const { batchId } = await ctx.params;
    const { organizationId, action } = bodySchema.parse(await request.json());
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw new AuthenticationError();
    const actor = { userId: session.user.id };
    const batch = action === "restore" ? await DeletionService.restore(batchId, organizationId, actor) : await DeletionService.purgeNow(batchId, organizationId, actor);
    return NextResponse.json({ batch });
  } catch (error) {
    return toErrorResponse(error);
  }
}
