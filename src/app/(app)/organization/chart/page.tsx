import type { Metadata } from "next";
import { GitBranch, Layers, UserRoundX, Users } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { OrgChartService } from "@/domains/workforce/org-chart-service";
import { summarizeOrgChart } from "@/domains/workforce/org-chart-summary";
import { OrganizationUnitService } from "@/domains/organization/organization-unit-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { formatDateKey } from "@/lib/date-key";
import { ChartFilters } from "./chart-filters";
import { OrgChartView } from "./org-chart-view";

export const metadata: Metadata = { title: "Organization chart" };

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OrganizationChartPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("employees.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view the organizational chart.</p>;
  }

  const asOfRaw = firstValue(params.asOf);
  const asOf = asOfRaw && /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : undefined;
  const [snapshot, units, positions, projects] = await Promise.all([
    OrgChartService.getSnapshot(organizationId, {
      asOf: asOf ? new Date(asOf) : undefined,
      search: firstValue(params.search),
      organizationUnitId: firstValue(params.organizationUnitId),
      positionId: firstValue(params.positionId),
      projectId: firstValue(params.projectId),
      employmentStatus: firstValue(params.employmentStatus),
    }),
    OrganizationUnitService.listCurrent(organizationId),
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
  ]);
  const summary = summarizeOrgChart(snapshot.roots);
  // Several people at the top usually means managers haven't been set, not several CEOs.
  const unlinked = Math.max(summary.topLevel - 1, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organizational chart"
        description={
          asOf
            ? `Reporting lines as they were on ${formatDateKey(asOf, { month: "long", day: "numeric", year: "numeric" })}. Built from assignments; change them on each person's profile.`
            : "Who reports to whom today, built from each person's current assignment. Change reporting lines on their profile."
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="People on the chart" value={summary.people} hint={`${summary.managers} with a team`} icon={Users} emphasis />
        <MetricCard label="Levels" value={summary.levels} hint="From the top to the deepest team" icon={Layers} />
        <MetricCard label="Largest team" value={summary.largestTeam} hint="Direct reports to one manager" icon={GitBranch} />
        <MetricCard
          label="No manager set"
          value={unlinked}
          hint={unlinked ? "Extra people at the top of the chart" : "Everyone reports to someone"}
          icon={UserRoundX}
          tone={unlinked ? "warning" : "success"}
        />
      </div>

      <ChartFilters
        units={units.map((unit) => ({ id: unit._id.toString(), label: unit.name }))}
        positions={positions.map((position) => ({ id: position._id.toString(), label: position.title }))}
        projects={projects.map((project) => ({ id: project._id.toString(), label: project.name }))}
      />

      <OrgChartView roots={snapshot.roots} />
    </div>
  );
}
