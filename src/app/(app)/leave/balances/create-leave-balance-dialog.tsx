"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

type Props = {
  organizationId: string;
  employees: SelectOption[];
  leaveTypes: SelectOption[];
  year: number;
  /** Pre-filled from a matrix cell or an employee's panel. */
  employeeId?: string;
  leaveTypeId?: string;
  /** "button": the page's main action; "cell": a small inline "Grant" link. */
  variant?: "button" | "cell";
};

/**
 * Grants a leave balance to one employee, or opens a leave type for the
 * year for everyone who doesn't have it yet (how HR usually starts a year).
 */
export function CreateLeaveBalanceDialog({ organizationId, employees, leaveTypes, year, employeeId: presetEmployee, leaveTypeId: presetType, variant = "button" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"one" | "everyone">("one");
  const [employeeId, setEmployeeId] = useState(presetEmployee ?? "");
  const [leaveTypeId, setLeaveTypeId] = useState(presetType ?? "");
  const [yearValue, setYearValue] = useState(String(year));
  const [entitledDays, setEntitledDays] = useState("15.00");
  const [hasNoFixedAmount, setHasNoFixedAmount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const employeeName = employees.find((employee) => employee.id === presetEmployee)?.label;
  const typeName = leaveTypes.find((type) => type.id === leaveTypeId)?.label ?? "this leave type";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if ((scope === "one" && !employeeId) || !leaveTypeId) {
      setError(scope === "one" ? "Select an employee and a leave type." : "Select a leave type.");
      return;
    }
    setIsSubmitting(true);
    const common = { organizationId, leaveTypeId, year: Number(yearValue), entitledDays: hasNoFixedAmount ? undefined : Number(entitledDays), hasNoFixedAmount };
    const response = await fetch(scope === "one" ? "/api/leave-balances" : "/api/leave-balances/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scope === "one" ? { ...common, employeeId } : common),
    });
    const body = await response.json().catch(() => ({}));
    setIsSubmitting(false);
    if (!response.ok) {
      setError(body.error ?? "Couldn't grant the leave balance.");
      return;
    }
    if (scope === "everyone") {
      const { granted, alreadyHad } = body.result as { granted: number; alreadyHad: number };
      toast.success(granted ? `Granted ${typeName} to ${granted} employee${granted === 1 ? "" : "s"}${alreadyHad ? ` (${alreadyHad} already had it)` : ""}` : "Everyone already has this balance");
    } else {
      toast.success("Leave balance granted");
    }
    setOpen(false);
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setScope("one");
      setEmployeeId(presetEmployee ?? "");
      setLeaveTypeId(presetType ?? "");
      setYearValue(String(year));
      setEntitledDays("15.00");
      setHasNoFixedAmount(false);
      setError(null);
    }
    setOpen(nextOpen);
  }

  const presetLocked = Boolean(presetEmployee);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(variant === "cell" ? "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10" : buttonVariants({ size: "sm" }))}
        data-testid={variant === "cell" ? "leave-balance-grant-cell" : "leave-balances-create-button"}
      >
        <Plus className="size-3.5" />
        {variant === "cell" ? "Grant" : "Grant balance"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{presetLocked ? `Grant leave to ${employeeName}` : "Grant leave balance"}</DialogTitle>
          <DialogDescription>Sets the days an employee can take for a leave type in a year. Adjust later for carry-overs or corrections.</DialogDescription>
        </DialogHeader>
        <form id="create-leave-balance-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {!presetLocked && (
            <div role="radiogroup" aria-label="Who gets it" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["one", "everyone"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={scope === value}
                  onClick={() => setScope(value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-150",
                    scope === value ? "bg-background text-foreground shadow-[var(--shadow-soft)]" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value === "one" ? "One employee" : "Everyone without it"}
                </button>
              ))}
            </div>
          )}
          <RequiredFieldsHint />
          {scope === "one" && !presetLocked && (
            <OptionSelect label="Employee" value={employeeId} onChange={setEmployeeId} options={employees} placeholder="Select an employee" required />
          )}
          <OptionSelect label="Leave type" value={leaveTypeId} onChange={setLeaveTypeId} options={leaveTypes} placeholder="Select a leave type" required />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Year" htmlFor="leave-balance-year" required>
              <Input id="leave-balance-year" type="number" value={yearValue} onChange={(event) => setYearValue(event.target.value)} placeholder="e.g. 2026" required />
            </FormField>
            <FormField label="Entitled days" htmlFor="leave-balance-days" required={!hasNoFixedAmount}>
              <Input
                id="leave-balance-days"
                type="number"
                min={0}
                max={999.99}
                step={0.01}
                value={entitledDays}
                onChange={(event) => setEntitledDays(event.target.value)}
                placeholder="e.g. 15.00"
                disabled={hasNoFixedAmount}
                required={!hasNoFixedAmount}
              />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={hasNoFixedAmount} onCheckedChange={(checked) => setHasNoFixedAmount(checked === true)} data-testid="leave-balance-no-fixed-amount" />
            Unlimited (no fixed number of days)
          </label>
          {scope === "everyone" && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Every current employee without a {typeName} balance for {yearValue} gets one. Existing balances aren&apos;t changed.
            </p>
          )}
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-leave-balance-form" disabled={isSubmitting} data-testid="leave-balances-create-submit-button">
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
            {isSubmitting ? "Granting…" : scope === "everyone" ? "Grant to everyone" : "Grant balance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
