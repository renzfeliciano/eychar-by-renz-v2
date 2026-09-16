import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { OrganizationService } from "@/domains/organization/organization-service";
import { AppShell } from "@/components/shared/app-shell";
import { ConcurrentSessionGuard } from "@/components/shared/concurrent-session-guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const organizations = await OrganizationService.listAccessibleTo(session.user.id);
  const organizationName = organizations[0]?.name ?? "No organization";

  return (
    <AppShell userName={session.user.name ?? session.user.email ?? "User"} organizationName={organizationName}>
      <ConcurrentSessionGuard />
      {children}
    </AppShell>
  );
}
