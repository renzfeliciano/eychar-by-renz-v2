import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreateRuleVersionForm } from "./create-rule-version-form";

export default async function PayrollRuleVersionsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-rule-versions.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view payroll rule versions.</p>;
  }

  const ruleVersions = await PayrollRuleVersionService.listCurrent(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll rule versions"
        description="Tax brackets and statutory contributions — versioned, never edited in place, so a payroll run always shows what was actually used."
      />
      <CreateRuleVersionForm organizationId={organizationId} />
      <DataTable
        columns={[
          { key: "version", header: "Version", render: (version) => `v${version.versionNumber}` },
          { key: "description", header: "Description", render: (version) => version.description ?? "—" },
          { key: "brackets", header: "Tax brackets", render: (version) => version.taxBrackets.length },
          { key: "contributions", header: "Contributions", render: (version) => version.statutoryContributions.length },
          { key: "status", header: "Status", render: (version) => <StatusBadge status={version.status} /> },
        ]}
        rows={ruleVersions}
        getRowKey={(version) => version._id.toString()}
        emptyMessage="No payroll rule versions yet."
      />
    </div>
  );
}
