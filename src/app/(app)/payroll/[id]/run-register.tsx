"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTableFrame } from "@/components/shared/data-table-frame";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, OctagonAlert, Plus, Printer, Search, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormError, FormField } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ADJUSTMENT_CATEGORIES } from "@/domains/payroll/adjustment-categories";
import { formatPeso } from "@/domains/payroll/payroll-labels";
import { formatMultiplierPercent } from "@/domains/payroll/engine/premiums";
import { cn } from "@/lib/utils";
import type { AdjustmentRow, RegisterRow } from "./run-types";

type Props = {
  runId: string;
  organizationId: string;
  records: RegisterRow[];
  adjustments: AdjustmentRow[];
  editable: boolean;
  /** The run's payroll policy overtime multiple of the hourly rate (1.25 = 125%), for the adjustment hint. */
  overtimeMultiplier: number;
};

function attendanceSummary(row: RegisterRow): string {
  const parts = [`${row.attendance.daysWorked} worked`];
  if (row.attendance.paidLeaveDays) parts.push(`${row.attendance.paidLeaveDays} leave`);
  if (row.attendance.absentDays) parts.push(`${row.attendance.absentDays} absent`);
  return parts.join(" · ");
}

/**
 * The run's register: one row per employee, opening into the full payslip
 * (earnings, contributions, tax, deductions, and why any warning was
 * raised). While the run is a draft, adjustments are added and removed
 * from the payslip, and the run recomputes on each change.
 */
export function RunRegister({ runId, organizationId, records, adjustments, editable, overtimeMultiplier }: Props) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const normalized = query.trim().toLowerCase();
  const visible = normalized ? records.filter((row) => row.employeeName.toLowerCase().includes(normalized) || row.employeeNumber.toLowerCase().includes(normalized)) : records;
  const open = records.find((row) => row.id === openId) ?? null;

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground" role="status">
        No one to pay in this run. Check that employees in scope have pay terms and an active employment status.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label="Find employee" placeholder="Find by name or employee #" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" />
        </div>
        <p className="text-sm text-muted-foreground">{editable ? "Open a payslip to add overtime, holiday pay, loans and other adjustments." : "Open a payslip for the full breakdown."}</p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-soft)]">
        <DataTableFrame
          testId="payroll-register"
          tableClassName="min-w-[760px]"
          head={
          <>
          <caption className="sr-only">Payroll register</caption>
          <thead className="sticky top-0 z-20 text-xs text-muted-foreground [&_th]:bg-muted">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Employee</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Attendance</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Gross pay</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Contributions</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Tax</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Other deductions</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Net pay</th>
              <th scope="col" className="w-8 px-2 py-2.5"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          </>
          }
          rows={[
            ...visible.map((row) => {
              const blocking = row.warnings.some((warning) => warning.blocking);
              const otherDeductions = row.totalDeductions - row.employeeContributions - row.tax;
              return (
                <tr
                  key={row.id}
                  className="group cursor-pointer border-b transition-colors duration-100 last:border-0 hover:bg-muted/40"
                  onClick={() => setOpenId(row.id)}
                  data-testid={`payroll-register-row-${row.employeeId}`}
                >
                  <td className="px-3 py-2.5">
                    <button type="button" className="flex flex-col text-left focus-visible:outline-none" onClick={() => setOpenId(row.id)} aria-label={`Open ${row.employeeName}'s payslip`}>
                      <span className="flex items-center gap-1.5 font-medium">
                        {row.employeeName}
                        {row.warnings.length > 0 &&
                          (blocking ? (
                            <OctagonAlert className="size-3.5 text-destructive" aria-label="Blocking issue" />
                          ) : (
                            <AlertTriangle className="size-3.5 text-warning" aria-label="Needs review" />
                          ))}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.employeeNumber}
                        {row.projectName ? ` · ${row.projectName}` : ""} · {row.rateType === "daily" ? `${formatPeso(row.rate)}/day` : `${formatPeso(row.rate)}/mo`}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{attendanceSummary(row)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPeso(row.grossPay)}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{formatPeso(row.employeeContributions)}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{formatPeso(row.tax)}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{otherDeductions ? formatPeso(otherDeductions) : "—"}</td>
                  <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", row.netPay < 0 && "text-destructive")}>{formatPeso(row.netPay)}</td>
                  <td className="px-2 py-2.5 text-muted-foreground">
                    <ChevronRight className="size-4 transition-[translate] duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                  </td>
                </tr>
              );
            }),
            ...(visible.length === 0
              ? [
                  <tr key="no-match">
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      No one matches &ldquo;{query.trim()}&rdquo;.
                    </td>
                  </tr>,
                ]
              : []),
          ]}
        />
      </div>

      <Sheet open={open !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          {open && (
            <Payslip
              row={open}
              runId={runId}
              organizationId={organizationId}
              adjustments={adjustments.filter((adjustment) => adjustment.employeeId === open.employeeId)}
              editable={editable}
              overtimeMultiplier={overtimeMultiplier}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Line({ label, amount, muted, strong }: { label: string; amount: number; muted?: boolean; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1", strong && "font-semibold", muted && "text-muted-foreground")}>
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 tabular-nums">{formatPeso(amount)}</span>
    </div>
  );
}

function Payslip({
  row,
  runId,
  organizationId,
  adjustments,
  editable,
  overtimeMultiplier,
}: {
  row: RegisterRow;
  runId: string;
  organizationId: string;
  adjustments: AdjustmentRow[];
  editable: boolean;
  overtimeMultiplier: number;
}) {
  const router = useRouter();
  const shortMinutes = row.attendance.lateMinutes + row.attendance.undertimeMinutes;

  // Runs inside ConfirmDialog: a throw keeps the dialog open with the reason shown.
  async function remove(adjustment: AdjustmentRow) {
    const response = await fetch(`/api/payroll-runs/${runId}/adjustments/${adjustment.id}?organizationId=${organizationId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Couldn't remove the adjustment.");
    }
    toast.success(`Removed ${adjustment.label}; payroll recomputed`);
    router.refresh();
  }

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle>{row.employeeName}</SheetTitle>
        <SheetDescription>
          {row.employeeNumber}
          {row.projectName ? ` · ${row.projectName}` : ""} · {row.rateType === "daily" ? "Daily-rated" : "Monthly-rated"} · {formatPeso(row.rate)}
          {row.rateType === "daily" ? " a day" : " a month"}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-5 p-4">
        {row.warnings.length > 0 && (
          <ul className="flex flex-col gap-2">
            {row.warnings.map((warning) => (
              <li
                key={warning.code}
                className={cn(
                  "flex gap-2 rounded-lg border px-3 py-2 text-sm",
                  warning.blocking ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-warning/30 bg-warning/10 text-foreground",
                )}
              >
                {warning.blocking ? <OctagonAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />}
                {warning.message}
              </li>
            ))}
          </ul>
        )}

        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Days worked", row.attendance.daysWorked + (row.attendance.restDaysWorked ? ` + ${row.attendance.restDaysWorked}` : "")],
            ["Absent", row.attendance.absentDays],
            ["Late/undertime", shortMinutes ? `${shortMinutes} min` : "—"],
            ["Paid leave", row.attendance.paidLeaveDays],
            ["Daily rate", formatPeso(row.dailyRate)],
            ["Hourly rate", formatPeso(row.hourlyRate)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted/50 px-2 py-2">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <section className="flex flex-col">
          <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Earnings</h3>
          {row.earnings.map((line, index) => (
            <Line key={`${line.code}-${index}`} label={`${line.label}${line.taxable === false ? " (non-taxable)" : ""}`} amount={line.amount} />
          ))}
          <div className="mt-1 border-t pt-1">
            <Line label="Gross pay" amount={row.grossPay} strong />
          </div>
        </section>

        <section className="flex flex-col">
          <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Deductions</h3>
          {row.contributions.map((line) => (
            <Line key={line.code} label={line.name} amount={line.employee} />
          ))}
          <Line label="Withholding tax" amount={row.tax} />
          {row.deductions.map((line, index) => (
            <Line key={`${line.code}-${index}`} label={line.label} amount={line.amount} />
          ))}
          <div className="mt-1 border-t pt-1">
            <Line label="Total deductions" amount={row.totalDeductions} strong />
          </div>
        </section>

        <div className="flex items-baseline justify-between rounded-xl border bg-primary/5 px-4 py-3">
          <span className="text-sm font-medium">Net pay</span>
          <span className={cn("text-2xl font-semibold tracking-tight tabular-nums", row.netPay < 0 ? "text-destructive" : "text-primary")}>{formatPeso(row.netPay)}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Taxable income {formatPeso(row.taxableIncome)}. Employer contributions {formatPeso(row.employerContributions)}
          {row.previousNetPay != null ? `. Last payroll's net pay ${formatPeso(row.previousNetPay)}.` : "."}
        </p>

        <section className="flex flex-col gap-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Adjustments</h3>
            <Link href={`/payroll/${runId}/payslips?employee=${row.employeeId}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              <Printer className="size-3.5" />
              Print payslip
            </Link>
          </div>
          {adjustments.length === 0 && <p className="text-sm text-muted-foreground">None{editable ? " yet." : "."}</p>}
          <ul className="flex flex-col divide-y rounded-lg border">
            {adjustments.map((adjustment) => (
              <li key={adjustment.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{adjustment.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {adjustment.direction === "earning" ? (adjustment.taxable ? "Taxable earning" : "Non-taxable earning") : "Deduction after tax"}
                    {adjustment.notes ? ` · ${adjustment.notes}` : ""}
                  </p>
                </div>
                <span className={cn("tabular-nums", adjustment.direction === "deduction" && "text-muted-foreground")}>
                  {adjustment.direction === "deduction" ? "−" : "+"}
                  {formatPeso(adjustment.amount)}
                </span>
                {editable && (
                  <ConfirmDialog
                    trigger={
                      <Button size="icon-sm" variant="ghost" className="max-md:min-h-10 max-md:min-w-10" aria-label={`Remove ${adjustment.label}`}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    }
                    title={`Remove ${adjustment.label}?`}
                    description="It comes off this payslip and the run is recomputed. You can add it again while the run is a draft."
                    confirmLabel="Remove adjustment"
                    confirmLoadingLabel="Removing…"
                    onConfirm={() => remove(adjustment)}
                    testId={`payroll-adjustment-remove-${adjustment.id}`}
                  />
                )}
              </li>
            ))}
          </ul>
          {editable && <AddAdjustmentForm runId={runId} organizationId={organizationId} employeeId={row.employeeId} hourlyRate={row.hourlyRate} overtimeMultiplier={overtimeMultiplier} />}
        </section>
      </div>
    </>
  );
}

function AddAdjustmentForm({ runId, organizationId, employeeId, hourlyRate, overtimeMultiplier }: { runId: string; organizationId: string; employeeId: string; hourlyRate: number; overtimeMultiplier: number }) {
  const router = useRouter();
  const [category, setCategory] = useState<string>("overtime");
  const [label, setLabel] = useState("Overtime");
  const [amount, setAmount] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const preset = ADJUSTMENT_CATEGORIES.find((item) => item.code === category);
  const direction = preset?.direction ?? "earning";

  function pick(code: string) {
    const next = ADJUSTMENT_CATEGORIES.find((item) => item.code === code);
    setCategory(code);
    if (next) {
      setLabel(next.label);
      setTaxable(next.taxable);
    }
  }

  async function submit() {
    setError(null);
    const value = Number(amount);
    if (!amount || !(value > 0)) return setError("Enter an amount above zero.");
    if (!label.trim()) return setError("Describe the adjustment.");
    setSaving(true);
    const response = await fetch(`/api/payroll-runs/${runId}/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, employeeId, category, label: label.trim(), direction, amount: value, taxable: direction === "earning" && taxable, notes: notes.trim() || undefined }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(body.error ?? "Couldn't add the adjustment.");
    toast.success(`Added ${label.trim()}; payroll recomputed`);
    setAmount("");
    setNotes("");
    router.refresh();
  }

  const earnings = ADJUSTMENT_CATEGORIES.filter((item) => item.direction === "earning");
  const deductions = ADJUSTMENT_CATEGORIES.filter((item) => item.direction === "deduction");

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3" data-testid="payroll-add-adjustment">
      <p className="text-sm font-medium">Add adjustment</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Type" required>
          <Select value={category} onValueChange={(value) => value && pick(value)}>
            <SelectTrigger className="w-full" data-testid="payroll-adjustment-category">
              <SelectValue>{preset?.label ?? category}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1 text-xs text-muted-foreground">Earnings</div>
              {earnings.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.label}
                </SelectItem>
              ))}
              <div className="px-2 py-1 text-xs text-muted-foreground">Deductions</div>
              {deductions.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Amount (₱)" htmlFor="payroll-adjustment-amount" required>
          <Input id="payroll-adjustment-amount" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 1250.00" />
        </FormField>
      </div>
      <FormField label="Payslip label" htmlFor="payroll-adjustment-label" required>
        <Input id="payroll-adjustment-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Overtime (Oct 12, 3 hrs)" />
      </FormField>
      <FormField label="Notes" htmlFor="payroll-adjustment-notes">
        <Input id="payroll-adjustment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Approved by site engineer" />
      </FormField>
      {direction === "earning" && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={taxable} onCheckedChange={(checked) => setTaxable(checked === true)} />
          Taxable
          <span className="text-xs text-muted-foreground">(13th month and de minimis benefits usually aren&apos;t)</span>
        </label>
      )}
      {(category === "overtime" || category === "rest_day_pay" || category === "holiday_pay") && (
        <p className="text-xs text-muted-foreground">
          For reference: hourly rate {formatPeso(hourlyRate)}; regular overtime is {formatMultiplierPercent(overtimeMultiplier)} of it ({formatPeso(hourlyRate * overtimeMultiplier)} an hour).
        </p>
      )}
      <FormError message={error} />
      <Button size="sm" className="self-end" onClick={submit} data-testid="payroll-adjustment-submit" icon={Plus} pending={saving} pendingLabel="Adding…">
        {`Add ${direction === "earning" ? "earning" : "deduction"}`}
      </Button>
    </div>
  );
}
