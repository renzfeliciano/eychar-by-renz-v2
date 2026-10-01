import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";

/** Whether the signed-in user is this organization's Super Administrator (who alone sees Delete). */
export async function isSuperAdmin(organizationId: string): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return SuperAdminService.isSuperAdmin(session?.user?.id, organizationId);
}
