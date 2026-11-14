import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployerTaxService } from "@/domains/payroll/employer-tax-service";
import { PageHeader } from "@/components/shared/page-header";
import { NoAccessState } from "@/components/shared/no-access-state";
import { EmployerTaxForm } from "./employer-tax-form";

export const metadata: Metadata = { title: "Employer tax details" };

export default async function EmployerTaxPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;
  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-policies.read", organizationId))) {
    return <NoAccessState permission="payroll-policies.read" message="You don't have access to payroll settings." />;
  }
  const [tax, canUpdate] = await Promise.all([EmployerTaxService.get(organizationId), hasPermission("payroll-policies.update", organizationId)]);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/payroll/rule-versions" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Rule versions
      </Link>
      <PageHeader title="Employer tax details" description="The organization's BIR registration, printed in the employer part of each employee's Form 2316." />
      <EmployerTaxForm organizationId={organizationId} initial={JSON.parse(JSON.stringify(tax))} canUpdate={canUpdate} />
    </div>
  );
}
