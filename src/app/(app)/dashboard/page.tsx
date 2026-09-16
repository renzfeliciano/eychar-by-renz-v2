import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { Building2, Users, ClipboardCheck, CalendarDays, Banknote, ArrowRight } from "lucide-react";
import { authOptions } from "@/server/auth/options";
import { OrganizationService } from "@/domains/organization/organization-service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const QUICK_LINKS = [
  { href: "/organization/units", label: "Organization structure", description: "Units, positions, locations, projects", icon: Building2 },
  { href: "/people", label: "People", description: "Roster, hiring, transfers", icon: Users },
  { href: "/attendance", label: "Attendance", description: "Daily roster and adjustments", icon: ClipboardCheck },
  { href: "/leave", label: "Leave", description: "Requests and approvals", icon: CalendarDays },
  { href: "/payroll", label: "Payroll", description: "Runs, policies, compensation", icon: Banknote },
];

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const organizations = await OrganizationService.listAccessibleTo(session.user.id);

  return (
    <div className="flex flex-col gap-6">
      {/* A soft brand-gradient hero for the page you land on right after
          signing in — the one surface where a splash of color reads as a
          welcome, not decoration competing with dense data tables below. */}
      <section className="bg-gradient-brand rounded-2xl p-6 text-primary-foreground shadow-[var(--shadow-glow)] sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">Welcome back</h1>
        <p className="mt-1 text-sm text-primary-foreground/85 sm:text-base">
          Signed in as {session.user.name ?? session.user.email}
        </p>
      </section>

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} data-testid={`dashboard-quick-link-${link.href.slice(1)}`}>
              <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/40 hover:shadow-lg">
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4.5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">{link.label}</CardTitle>
                    <CardDescription>{link.description}</CardDescription>
                  </div>
                  <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover/card:translate-x-0.5" />
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
