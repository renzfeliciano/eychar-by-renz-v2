import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PAYROLL_RUN_STATUS_LABELS, runTitle, type PayrollRunStatus } from "@/domains/payroll/payroll-labels";
import { NotFoundError } from "@/shared/errors";
import { dateToDateKey, formatDateKey, formatDateRange } from "@/lib/date-key";
import { PrintButton } from "./print-button";
import { PayslipCard, type PayslipRecord } from "./payslip-card";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "Payslips" };

export default async function PayslipsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ employee?: string }> }) {
  const [{ id }, { employee }] = await Promise.all([params, searchParams]);
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;
  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-runs.read", organizationId))) {
    return <NoAccessState permission="payroll-runs.read" message="You don't have access to view payslips." />;
  }

  let detail;
  try {
    detail = await PayrollRunService.getDetail(id, organizationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { run } = detail;
  const records = employee ? detail.records.filter((record) => record.employeeId.toString() === employee) : detail.records;
  const projects = await ProjectService.listCurrent(organizationId);
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const periodLabel = formatDateRange(dateToDateKey(run.payPeriodStart), dateToDateKey(run.payPeriodEnd));
  const payDateLabel = formatDateKey(dateToDateKey(run.payDate));
  const isFinal = run.status === "approved" || run.status === "released";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1">
          <Link href={`/payroll/${id}`} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {run.runNumber}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Payslips</h1>
          <p className="text-sm text-muted-foreground">
            {records.length === 1 ? records[0].employeeName : `${records.length} employees`} · {periodLabel}
            {!isFinal && ` · ${PAYROLL_RUN_STATUS_LABELS[run.status as PayrollRunStatus]}, not final yet`}
          </p>
        </div>
        <PrintButton label={records.length === 1 ? "Print payslip" : "Print all"} />
      </div>

      <div className="flex flex-col gap-6 print:gap-0">
        {records.map((record) => (
          <PayslipCard
            key={record._id.toString()}
            record={record as unknown as PayslipRecord}
            organizationName={organization.name}
            runLabel={runTitle(run)}
            periodLabel={periodLabel}
            payDateLabel={payDateLabel}
            isFinal={isFinal}
            projectName={record.projectId ? (projectNameById.get(record.projectId.toString()) ?? null) : null}
          />
        ))}
        {records.length === 0 && <p className="text-sm text-muted-foreground">No payslips in this run.</p>}
      </div>
    </div>
  );
}
