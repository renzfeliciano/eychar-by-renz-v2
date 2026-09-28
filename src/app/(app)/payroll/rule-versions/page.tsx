import Link from "next/link";
import { BadgeCheck, History, Landmark, Plus, Receipt } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { PAY_FREQUENCY_LABELS, type PayFrequency } from "@/domains/payroll/engine/pay-frequency";
import { dateToDateKey, formatDateKey } from "@/lib/date-key";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function PayrollRuleVersionsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-rule-versions.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view payroll rule versions.</p>;
  }

  const [canCreate, ruleVersions, resolved] = await Promise.all([
    hasPermission("payroll-rule-versions.create", organizationId),
    PayrollRuleVersionService.listCurrent(organizationId),
    PayrollRuleVersionService.resolve({ organizationId, effectiveDate: new Date() }),
  ]);
  const inUse = resolved?.policy ?? null;
  const upcoming = ruleVersions.filter((version) => version.status !== "inactive" && new Date(version.effectiveFrom) > new Date()).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rule versions"
        description="Withholding tax and government contribution tables, as data. Versions are never edited: a change is a new version, so every run shows exactly what it used."
        action={
          canCreate ? (
            <Link href="/payroll/rule-versions/new" className={cn(buttonVariants({ size: "sm" }))} data-testid="payroll-rule-versions-create-button">
              <Plus className="size-3.5" />
              New version
            </Link>
          ) : undefined
        }
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          label="In use today"
          value={inUse ? `v${inUse.versionNumber}` : "None"}
          hint={inUse ? `${inUse.name ?? "Untitled"}, since ${formatDateKey(dateToDateKey(inUse.effectiveFrom))}` : "Payroll can't compute tax or contributions yet"}
          icon={BadgeCheck}
          emphasis={Boolean(inUse)}
          tone={inUse ? "default" : "danger"}
          href={inUse ? `/payroll/rule-versions/${inUse._id.toString()}` : undefined}
        />
        <MetricCard label="Tax tables" value={inUse?.taxTables?.length ?? 0} hint="Pay frequencies the version covers" icon={Landmark} />
        <MetricCard label="Contribution rules" value={inUse?.contributions?.length ?? 0} hint="SSS, PhilHealth, Pag-IBIG and others" icon={Receipt} />
        <MetricCard label="Versions on record" value={ruleVersions.length} hint={upcoming ? `${upcoming} scheduled to start later` : "Past runs keep the version they used"} icon={History} />
      </div>
      <DataTable
        caption="Payroll rule versions"
        columns={[
          {
            key: "version",
            header: "Version",
            render: (version) => (
              <Link href={`/payroll/rule-versions/${version._id.toString()}`} className="flex flex-col">
                <span className="font-medium text-primary hover:underline">
                  v{version.versionNumber} · {version.name ?? "Untitled"}
                </span>
                {version.description && <span className="line-clamp-1 max-w-md text-xs text-muted-foreground">{version.description}</span>}
              </Link>
            ),
          },
          { key: "effective", header: "Effective from", render: (version) => formatDateKey(dateToDateKey(version.effectiveFrom)) },
          {
            key: "tax",
            header: "Tax tables",
            render: (version) =>
              version.taxTables?.length ? (
                version.taxTables.map((table: { payFrequency: string }) => PAY_FREQUENCY_LABELS[table.payFrequency as PayFrequency]).join(", ")
              ) : (
                <span className="text-muted-foreground">None (old format)</span>
              ),
          },
          {
            key: "contributions",
            header: "Contributions",
            render: (version) => (version.contributions?.length ? version.contributions.map((rule: { name: string }) => rule.name).join(", ") : <span className="text-muted-foreground">—</span>),
          },
          { key: "status", header: "Status", render: (version) => <StatusBadge status={version.status} /> },
        ]}
        rows={ruleVersions}
        getRowKey={(version) => version._id.toString()}
        emptyMessage="No rule versions yet. Create one from the Philippine 2025 template."
      />
    </div>
  );
}
