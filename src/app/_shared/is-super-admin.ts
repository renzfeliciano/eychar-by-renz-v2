import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { getSession } from "@/server/auth/session";

/** Whether the signed-in user is this organization's Super Administrator (who alone sees Delete). */
export async function isSuperAdmin(organizationId: string): Promise<boolean> {
  const session = await getSession();
  return SuperAdminService.isSuperAdmin(session?.user?.id, organizationId);
}
