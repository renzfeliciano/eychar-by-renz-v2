import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { Building2, Users, ArrowRight } from "lucide-react";
import { authOptions } from "@/server/auth/options";
import { OrganizationService } from "@/domains/organization/organization-service";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const organizations = await OrganizationService.listAccessibleTo(session.user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={`Signed in as ${session.user.name ?? session.user.email}`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your organizations</CardTitle>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organization access yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {organizations.map((organization) => (
                <li key={organization._id.toString()} className="text-sm font-medium">
                  {organization.name}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/organization/units">
          <Card className="transition-colors hover:border-primary/50 hover:bg-accent/40">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="size-4.5" />
              </div>
              <div>
                <CardTitle className="text-sm">Organization structure</CardTitle>
                <CardDescription>Units, positions, locations, projects</CardDescription>
              </div>
              <ArrowRight className="ml-auto size-4 text-muted-foreground" />
            </CardHeader>
          </Card>
        </Link>

        <Link href="/people">
          <Card className="transition-colors hover:border-primary/50 hover:bg-accent/40">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-4.5" />
              </div>
              <div>
                <CardTitle className="text-sm">People</CardTitle>
                <CardDescription>Roster, hiring, transfers</CardDescription>
              </div>
              <ArrowRight className="ml-auto size-4 text-muted-foreground" />
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
