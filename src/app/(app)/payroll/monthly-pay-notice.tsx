"use client";

import { TriangleAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { MONTHLY_PAY_ACKNOWLEDGEMENT, MONTHLY_PAY_WARNING } from "@/domains/payroll/engine/pay-frequency";

/**
 * Shown when HR picks monthly pay (payroll plan Phase 6). Monthly is never blocked, but saving needs the tick;
 * the server stores who ticked it, when and this text, and audits it.
 */
export function MonthlyPayNotice({ checked, onCheckedChange, testId = "monthly-pay-notice" }: { checked: boolean; onCheckedChange: (checked: boolean) => void; testId?: string }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10" data-testid={testId}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <p>{MONTHLY_PAY_WARNING}</p>
        <label className="flex items-start gap-2 font-medium">
          <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} data-testid={`${testId}-acknowledge`} />
          {MONTHLY_PAY_ACKNOWLEDGEMENT}
        </label>
      </div>
    </div>
  );
}
