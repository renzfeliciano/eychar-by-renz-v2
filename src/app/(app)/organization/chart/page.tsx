import type { Metadata } from "next";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { OrgChartService } from "@/domains/workforce/org-chart-service";
import { PageHeader } from "@/components/shared/page-header";
import { NoAccessState } from "@/components/shared/no-access-state";
import { OrgChartCanvas } from "./org-chart-canvas";

export const metadata: Metadata = { title: "Organization chart" };

export default async function OrganizationChartPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("employees.read", organizationId))) {
    return <NoAccessState permission="employees.read" message="You don't have access to view the organizational chart." />;
  }
  const [chart, canEdit] = await Promise.all([OrgChartService.get(organizationId), hasPermission("org-chart.update", organizationId)]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Organization chart"
        description={
          canEdit
            ? "Build it like blocks: add people and group boxes, drag them where you want, and drag the dot on top of a card onto the person they report to. The chart tidies itself into a tree."
            : "Who sits under whom, as HR has drawn it."
        }
      />
      <OrgChartCanvas key={chart.updatedAt ?? "draft"} organizationId={organizationId} initial={chart} canEdit={canEdit} />
    </div>
  );
}
