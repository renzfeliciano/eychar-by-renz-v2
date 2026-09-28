"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { buttonVariants } from "@/components/ui/button";
import { AdjustLeaveBalanceDialog } from "@/components/shared/adjust-leave-balance-dialog";
import type { SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";
import { CreateLeaveBalanceDialog } from "./create-leave-balance-dialog";
import { formatDays, UsageBar } from "./usage-bar";

export type EmployeeBalanceLine = {
  leaveTypeId: string;
  leaveTypeName: string;
  balance: {
    balanceId: string;
    entitledDays: number;
    adjustmentDays: number;
    usedDays: number;
    pendingDays: number;
    availableDays: number | null;
    unlimited: boolean;
  } | null;
};

type Props = {
  organizationId: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  projectName: string | null;
  year: number;
  lines: EmployeeBalanceLine[];
  employees: SelectOption[];
  leaveTypes: SelectOption[];
  canCreate: boolean;
  canUpdate: boolean;
};

/** One employee's leave for the year: every type, how it adds up, and the actions on it. */
export function EmployeeBalanceSheet(props: Props) {
  const [open, setOpen] = useState(false);
  const { lines, year } = props;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-2 text-left focus-visible:outline-none"
        aria-label={`Open ${props.employeeName}'s leave`}
        data-testid={`leave-balance-employee-${props.employeeId}`}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">
          {props.employeeName
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium group-hover:text-primary">{props.employeeName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {props.employeeNumber}
            {props.projectName ? ` · ${props.projectName}` : ""}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-[translate] duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>{props.employeeName}</SheetTitle>
            <SheetDescription>
              {props.employeeNumber}
              {props.projectName ? ` · ${props.projectName}` : ""} · Leave for {year}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 p-4">
            {lines.map((line) => (
              <section key={line.leaveTypeId} className="rounded-xl border bg-card p-3" aria-label={line.leaveTypeName}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{line.leaveTypeName}</h3>
                  {line.balance && props.canUpdate && (
                    <AdjustLeaveBalanceDialog
                      organizationId={props.organizationId}
                      balanceId={line.balance.balanceId}
                      leaveTypeLabel={line.leaveTypeName}
                      currentAdjustmentDays={line.balance.adjustmentDays}
                    />
                  )}
                  {!line.balance && props.canCreate && (
                    <CreateLeaveBalanceDialog
                      organizationId={props.organizationId}
                      employees={props.employees}
                      leaveTypes={props.leaveTypes}
                      year={year}
                      employeeId={props.employeeId}
                      leaveTypeId={line.leaveTypeId}
                      variant="cell"
                    />
                  )}
                </div>
                {line.balance ? (
                  <>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-2xl font-semibold tracking-tight tabular-nums">{line.balance.unlimited ? "Unlimited" : formatDays(line.balance.availableDays ?? 0)}</span>
                      {!line.balance.unlimited && <span className="text-sm text-muted-foreground">days left</span>}
                    </div>
                    {!line.balance.unlimited && <UsageBar used={line.balance.usedDays} pending={line.balance.pendingDays} total={line.balance.entitledDays + line.balance.adjustmentDays} className="mt-2" />}
                    <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                      {[
                        ["Entitled", line.balance.unlimited ? "—" : formatDays(line.balance.entitledDays)],
                        ["Adjusted", line.balance.adjustmentDays ? `${line.balance.adjustmentDays > 0 ? "+" : ""}${formatDays(line.balance.adjustmentDays)}` : "—"],
                        ["Used", formatDays(line.balance.usedDays)],
                        ["Pending", formatDays(line.balance.pendingDays)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg bg-muted/50 px-1 py-1.5">
                          <dt className="text-[11px] text-muted-foreground">{label}</dt>
                          <dd className="text-sm font-medium tabular-nums">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No {line.leaveTypeName.toLowerCase()} balance for {year}.</p>
                )}
              </section>
            ))}
            <Link href={`/people/${props.employeeId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}>
              <ExternalLink className="size-3.5" />
              Open employee profile
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
