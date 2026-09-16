import { requirePermission } from "@/server/authorization";
import { AuthorizationError } from "@/shared/errors";

export async function hasPermission(permission: string, organizationId: string): Promise<boolean> {
  try {
    await requirePermission(permission, organizationId);
    return true;
  } catch (error) {
    if (error instanceof AuthorizationError) return false;
    throw error;
  }
}
