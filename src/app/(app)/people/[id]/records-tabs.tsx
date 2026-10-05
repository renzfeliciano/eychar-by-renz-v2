import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/app-time";
import { formatMoney } from "@/lib/money";
import { formatDate } from "./profile-format";

/**
 * The profile tabs that show another module's records for this one person
 * (ADR-047): read here, act in the module itself (the link on each card).
 */
function Section({ title, description, href, linkLabel, children }: { title: string; description: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {href && (
          <CardAction>
            <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              {linkLabel}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

type LeaveRequestRow = { id: string; type: string; startDate: Date; endDate: Date; totalDays: number; status: string; reason?: string };

export function LeaveRequestsCard({ requests }: { requests: LeaveRequestRow[] }) {
  return (
    <Section title="Leave requests" description="Everything they've filed, newest first" href="/leave" linkLabel="Decide in Leave">
      <DataTable
        rows={requests}
        getRowKey={(row) => row.id}
        emptyMessage="No leave filed yet."
        testId="profile-leave-requests"
        columns={[
          { key: "dates", header: "Dates", render: (row) => (row.totalDays === 1 ? formatDate(row.startDate) : `${formatDate(row.startDate)} – ${formatDate(row.endDate)}`) },
          { key: "type", header: "Type", render: (row) => row.type },
          { key: "days", header: "Days", width: "xs", render: (row) => row.totalDays },
          { key: "reason", header: "Reason", width: "lg", render: (row) => row.reason || "—" },
          { key: "status", header: "Status", width: "auto", truncate: false, render: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </Section>
  );
}

type AttendanceRow = { id: string; date: Date; checkInAt?: Date | null; checkOutAt?: Date | null; status: string };

export function AttendanceTab({ records, days }: { records: AttendanceRow[]; days: number }) {
  return (
    <Section title="Attendance" description={`Time in and out over the last ${days} days`} href="/attendance" linkLabel="Open daily roster">
      <DataTable
        rows={records}
        getRowKey={(row) => row.id}
        emptyMessage={`No attendance in the last ${days} days.`}
        testId="profile-attendance"
        columns={[
          { key: "date", header: "Date", render: (row) => formatDate(row.date) },
          { key: "in", header: "Time in", width: "sm", render: (row) => (row.checkInAt ? formatTime(row.checkInAt) : "—") },
          { key: "out", header: "Time out", width: "sm", render: (row) => (row.checkOutAt ? formatTime(row.checkOutAt) : "—") },
          { key: "status", header: "Status", width: "auto", truncate: false, render: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </Section>
  );
}

type PayTermsRow = { id: string; rateType: string; rate: number; allowances: number; effectiveFrom: Date; effectiveTo?: Date | null; reason?: string };
type PayslipRow = { id: string; runId: string; runNumber: string; status: string; periodStart: Date; periodEnd: Date; payDate: Date; grossPay: number; netPay: number };

export function PayTab({ terms, payslips, showTerms, showPayslips }: { terms: PayTermsRow[]; payslips: PayslipRow[]; showTerms: boolean; showPayslips: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {showTerms && (
        <Section title="Pay terms" description="Rate and allowances, with every change kept" href="/payroll/compensation" linkLabel="Change in Compensation">
          <DataTable
            rows={terms}
            getRowKey={(row) => row.id}
            emptyMessage="No pay terms on file."
            emptyDescription="Payroll skips anyone without pay terms."
            testId="profile-pay-terms"
            columns={[
              { key: "from", header: "Effective", render: (row) => `${formatDate(row.effectiveFrom)} – ${row.effectiveTo ? formatDate(row.effectiveTo) : "now"}` },
              { key: "rate", header: "Rate", width: "md", render: (row) => `${formatMoney(row.rate)} / ${row.rateType === "daily" ? "day" : "month"}` },
              { key: "allowances", header: "Allowances", width: "sm", render: (row) => (row.allowances ? formatMoney(row.allowances) : "—") },
              { key: "reason", header: "Reason", width: "lg", render: (row) => row.reason || "—" },
            ]}
          />
        </Section>
      )}
      {showPayslips && (
        <Section title="Payslips" description="Their line in every payroll run" href="/payroll" linkLabel="Open Payroll">
          <DataTable
            rows={payslips}
            getRowKey={(row) => row.id}
            emptyMessage="Not in any payroll run yet."
            testId="profile-payslips"
            columns={[
              { key: "run", header: "Run", render: (row) => <Link href={`/payroll/${row.runId}`} className="font-medium text-primary hover:underline">{row.runNumber}</Link> },
              { key: "period", header: "Period", width: "lg", render: (row) => `${formatDate(row.periodStart)} – ${formatDate(row.periodEnd)}` },
              { key: "pay", header: "Pay date", width: "sm", render: (row) => formatDate(row.payDate) },
              { key: "gross", header: "Gross", width: "sm", render: (row) => formatMoney(row.grossPay) },
              { key: "net", header: "Net", width: "sm", render: (row) => <span className="font-medium">{formatMoney(row.netPay)}</span> },
              { key: "status", header: "Status", width: "auto", truncate: false, render: (row) => <StatusBadge status={row.status} /> },
            ]}
          />
        </Section>
      )}
    </div>
  );
}

type TravelRow = { id: string; startDate: Date; endDate: Date; remarks?: string; status: string; companions: number };

export function TravelTab({ orders }: { orders: TravelRow[] }) {
  return (
    <Section title="Travel orders" description="Trips they're on, latest first" href="/travel-orders" linkLabel="Open Travel orders">
      <DataTable
        rows={orders}
        getRowKey={(row) => row.id}
        emptyMessage="No travel orders."
        testId="profile-travel"
        columns={[
          { key: "dates", header: "Dates", render: (row) => `${formatDate(row.startDate)} – ${formatDate(row.endDate)}` },
          { key: "remarks", header: "Purpose", width: "xl", render: (row) => row.remarks || "—" },
          { key: "with", header: "With", width: "sm", render: (row) => (row.companions ? `${row.companions} other${row.companions === 1 ? "" : "s"}` : "Alone") },
          { key: "status", header: "Status", width: "auto", truncate: false, render: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </Section>
  );
}

type ReviewRow = { id: string; cycleId: string; cycle: string; rating?: string; status: string; submittedAt?: Date | null };

export function PerformanceTab({ reviews }: { reviews: ReviewRow[] }) {
  return (
    <Section title="Performance reviews" description="Their review in each cycle" href="/performance" linkLabel="Open Performance">
      <DataTable
        rows={reviews}
        getRowKey={(row) => row.id}
        emptyMessage="Not reviewed yet."
        testId="profile-reviews"
        columns={[
          { key: "cycle", header: "Cycle", render: (row) => <Link href={`/performance/${row.cycleId}`} className="font-medium text-primary hover:underline">{row.cycle}</Link> },
          { key: "rating", header: "Rating", width: "md", render: (row) => row.rating || "—" },
          { key: "submitted", header: "Submitted", width: "sm", render: (row) => (row.submittedAt ? formatDate(row.submittedAt) : "—") },
          { key: "status", header: "Status", width: "auto", truncate: false, render: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </Section>
  );
}

type OffboardingRow = { id: string; separationType: string; lastWorkingDay: Date; status: string; settlement: { id: string; status: string; net: number | null } | null };

export function OffboardingTab({ cases, showSettlements }: { cases: OffboardingRow[]; showSettlements: boolean }) {
  return (
    <Section title="Offboarding" description="Clearance and final pay" href="/clearance" linkLabel="Open Offboarding">
      <DataTable
        rows={cases}
        getRowKey={(row) => row.id}
        emptyMessage="Not leaving: no clearance on file."
        testId="profile-offboarding"
        columns={[
          { key: "type", header: "Separation", render: (row) => <Link href={`/clearance/${row.id}`} className="font-medium text-primary hover:underline">{row.separationType}</Link> },
          { key: "last", header: "Last working day", width: "md", render: (row) => formatDate(row.lastWorkingDay) },
          { key: "status", header: "Clearance", width: "auto", truncate: false, render: (row) => <StatusBadge status={row.status} /> },
          ...(showSettlements
            ? [
                {
                  key: "settlement",
                  header: "Final pay",
                  width: "md" as const,
                  truncate: false,
                  render: (row: OffboardingRow) =>
                    row.settlement ? (
                      <Link href={`/final-settlements/${row.settlement.id}`} className="inline-flex items-center gap-2 hover:underline">
                        <StatusBadge status={row.settlement.status} />
                        {row.settlement.net !== null && <span className="text-sm">{formatMoney(row.settlement.net)}</span>}
                      </Link>
                    ) : (
                      "Not prepared"
                    ),
                },
              ]
            : []),
        ]}
      />
    </Section>
  );
}
