import { requireAuthenticatedUser } from "@/server/authorization";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DeletionService } from "@/domains/deletion/deletion-service";
import { toErrorResponse } from "@/shared/errors/to-response";
import { objectId } from "@/shared/validation/object-id";

const bodySchema = z.object({ organizationId: objectId(), action: z.enum(["restore", "purge"]) });

/** Restore a recycle-bin entry, or purge it for good now. Super Administrator only (checked in the service). */
export async function POST(request: Request, ctx: RouteContext<"/api/deletions/[batchId]">) {
  try {
    const { batchId } = await ctx.params;
    const { organizationId, action } = bodySchema.parse(await request.json());
    const { userId } = await requireAuthenticatedUser();
    const actor = { userId: userId };
    const batch = action === "restore" ? await DeletionService.restore(batchId, organizationId, actor) : await DeletionService.purgeNow(batchId, organizationId, actor);
    return NextResponse.json({ batch });
  } catch (error) {
    return toErrorResponse(error);
  }
}
