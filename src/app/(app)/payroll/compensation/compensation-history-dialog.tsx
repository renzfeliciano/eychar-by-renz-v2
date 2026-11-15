"use client";

import { History } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { CompensationHistoryEntry } from "@/domains/payroll/compensation-history";
import { formatDateKey } from "@/lib/date-key";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Every pay change for one employee: previous salary, revised basic, increase, new total and effectivity date. */
export function CompensationHistoryTable({ entries }: { entries: CompensationHistoryEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No pay terms on file.</p>;
  const cell = "px-2 py-1.5 text-right tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Compensation history">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">Effective</th>
            <th className={cn(cell, "font-medium")}>Previous</th>
            <th className={cn(cell, "font-medium")}>Revised basic</th>
            <th className={cn(cell, "font-medium")}>Increase</th>
            <th className={cn(cell, "font-medium")}>New total</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b last:border-0 align-top">
              <td className="px-2 py-1.5">
                <span className="block whitespace-nowrap">{formatDateKey(entry.effectiveFrom)}</span>
                {entry.reason && <span className="block text-xs text-muted-foreground">{entry.reason}</span>}
              </td>
              <td className={cell}>{entry.previousRate === null ? "—" : formatMoney(entry.previousRate)}</td>
              <td className={cell}>{formatMoney(entry.baseRate)}</td>
              <td className={cell}>{entry.annualIncrease ? formatMoney(entry.annualIncrease) : "—"}</td>
              <td className={cn(cell, "font-medium")}>
                {formatMoney(entry.rate)}
                <span className="block text-xs font-normal text-muted-foreground">{entry.rateType === "daily" ? "per day" : "per month"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompensationHistoryDialog({ employeeId, employeeName, entries }: { employeeId: string; employeeName: string; entries: CompensationHistoryEntry[] }) {
  return (
    <Dialog>
      <DialogTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }))} data-testid={`compensation-history-${employeeId}`}>
        <History className="size-3.5" />
        History
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{employeeName}&apos;s pay history</DialogTitle>
          <DialogDescription>Every salary change with the amount it replaced, the increase and the date it took effect.</DialogDescription>
        </DialogHeader>
        <CompensationHistoryTable entries={entries} />
      </DialogContent>
    </Dialog>
  );
}
