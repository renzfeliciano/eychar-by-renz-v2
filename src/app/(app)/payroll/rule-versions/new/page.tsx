import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { PH_STATUTORY_2025 } from "@/domains/payroll/templates/ph-statutory-2025";
import type { PayFrequency } from "@/domains/payroll/engine/pay-frequency";
import { PageHeader } from "@/components/shared/page-header";
import { RuleVersionEditor, type EditorInitial } from "../rule-version-editor";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "New rule version" };

export default async function NewRuleVersionPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;
  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-rule-versions.create", organizationId))) {
    return <NoAccessState permission="payroll-rule-versions.create" message="You don't have access to create payroll rule versions." />;
  }

  // Start from the version asked for, else the newest one with tables, else the PH template.
  const versions = await PayrollRuleVersionService.listCurrent(organizationId);
  const base = (from ? versions.find((version) => version._id.toString() === from) : undefined) ?? versions.find((version) => version.taxTables?.length > 0);
  const initial: EditorInitial = base
    ? {
        name: `${base.name} (revised)`,
        description: "",
        basedOnVersionId: base._id.toString(),
        basedOnLabel: `v${base.versionNumber} · ${base.name}`,
        taxTables: base.taxTables.map((table: { payFrequency: string; brackets: EditorInitial["taxTables"][number]["brackets"] }) => ({
          payFrequency: table.payFrequency as PayFrequency,
          brackets: table.brackets.map((bracket) => ({ minIncome: bracket.minIncome, maxIncome: bracket.maxIncome ?? null, rate: bracket.rate, baseDeduction: bracket.baseDeduction })),
        })),
        contributions: base.contributions.map((rule: EditorInitial["contributions"][number]) => ({
          code: rule.code,
          name: rule.name,
          floor: rule.floor ?? null,
          ceiling: rule.ceiling ?? null,
          extraLabel: rule.extraLabel ?? null,
          rows: rule.rows.map((row) => ({ ...row })),
        })),
      }
    : { name: PH_STATUTORY_2025.name, description: PH_STATUTORY_2025.description, basedOnLabel: "the Philippine 2025 template", taxTables: PH_STATUTORY_2025.taxTables, contributions: PH_STATUTORY_2025.contributions };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/payroll/rule-versions" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Rule versions
      </Link>
      <PageHeader title="New rule version" description="Update tax or contribution tables when an agency publishes new rates. Runs already prepared keep the version they used." />
      <RuleVersionEditor organizationId={organizationId} initial={JSON.parse(JSON.stringify(initial))} />
    </div>
  );
}
