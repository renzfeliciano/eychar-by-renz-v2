import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel } from "@/server/db/models";
import { OrganizationService } from "@/domains/organization/organization-service";
import { AppShell } from "@/components/shared/app-shell";
import { ConcurrentSessionGuard } from "@/components/shared/concurrent-session-guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  // A self-service employee account has no business in the HR admin
  // shell — send it straight to the clock-in/out portal instead.
  await connectMongoDB();
  const user = await UserModel.findById(session.user.id).select("employeeId").lean();
  if (user?.employeeId) redirect("/clock");

  const organizations = await OrganizationService.listAccessibleTo(session.user.id);
  const organizationName = organizations[0]?.name ?? "No organization";

  return (
    <AppShell userName={session.user.name ?? session.user.email ?? "User"} organizationName={organizationName}>
      <ConcurrentSessionGuard />
      {children}
    </AppShell>
  );
}
