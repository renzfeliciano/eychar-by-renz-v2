import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { CATALOG_REGISTRY, isCatalogTypeSlug } from "@/domains/catalog/catalog-registry";
import { createSimpleCatalogItemSchema } from "@/shared/validation/catalog";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { NotFoundError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/catalogs/[type]">) {
  try {
    const { type } = await ctx.params;
    if (!isCatalogTypeSlug(type)) throw new NotFoundError(`Unknown catalog type "${type}"`);
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });

    const { service, permissionPrefix } = CATALOG_REGISTRY[type];
    await requirePermission(`${permissionPrefix}.read`, organizationId);
    const items = await service.listCurrent(organizationId);
    return NextResponse.json({ items });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/catalogs/[type]">) {
  try {
    const { type } = await ctx.params;
    if (!isCatalogTypeSlug(type)) throw new NotFoundError(`Unknown catalog type "${type}"`);
    const input = createSimpleCatalogItemSchema.parse(await request.json());

    const { service, permissionPrefix } = CATALOG_REGISTRY[type];
    const { userId } = await requirePermission(`${permissionPrefix}.create`, input.organizationId);
    const item = await service.create(input, { userId });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
