import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { CATALOG_REGISTRY, isCatalogTypeSlug } from "@/domains/catalog/catalog-registry";
import { updateCatalogItemSchema } from "@/shared/validation/catalog";
import { NotFoundError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/catalogs/[type]/[id]">) {
  try {
    const { type, id } = await ctx.params;
    if (!isCatalogTypeSlug(type)) throw new NotFoundError(`Unknown catalog type "${type}"`);
    const input = updateCatalogItemSchema.parse(await request.json());

    const { service, permissionPrefix } = CATALOG_REGISTRY[type];
    const { userId } = await requirePermission(`${permissionPrefix}.update`, input.organizationId);
    const item = input.status !== undefined
      ? await service.updateStatus(id, input.organizationId, { status: input.status }, { userId })
      : await service.update(id, input.organizationId, { name: input.name, description: input.description }, { userId });
    return NextResponse.json({ item });
  } catch (error) {
    return toErrorResponse(error);
  }
}
