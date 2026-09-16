import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { OrgChartService } from "@/domains/workforce/org-chart-service";
import { OrganizationUnitService } from "@/domains/organization/organization-unit-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartFilters } from "./chart-filters";
import { OrgChartTree } from "./org-chart-tree";

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
  const [snapshot, units, positions, projects] = await Promise.all([
    OrgChartService.getSnapshot(organizationId, {
      asOf: asOfRaw ? new Date(asOfRaw) : undefined,
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organizational chart"
        description="A projection of current reporting relationships and assignments — not a source of truth."
      />

      <ChartFilters
        units={units.map((unit) => ({ id: unit._id.toString(), label: unit.name }))}
        positions={positions.map((position) => ({ id: position._id.toString(), label: position.title }))}
        projects={projects.map((project) => ({ id: project._id.toString(), label: project.name }))}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Reporting structure</CardTitle>
          </CardHeader>
          <CardContent>
            <OrgChartTree roots={snapshot.roots} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vacant positions</CardTitle>
          </CardHeader>
          <CardContent>
            {snapshot.vacantPositions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No vacant positions.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {snapshot.vacantPositions.map((position) => (
                  <li key={position.id} className="text-sm">
                    <span className="font-medium">{position.title}</span>
                    <span className="text-muted-foreground"> ({position.code})</span>
                    {position.organizationUnitName && (
                      <p className="text-xs text-muted-foreground">{position.organizationUnitName}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
