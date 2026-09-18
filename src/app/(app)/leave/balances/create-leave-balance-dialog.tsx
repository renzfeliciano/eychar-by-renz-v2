"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

export function CreateLeaveBalanceDialog({
  organizationId,
  employees,
  leaveTypes,
}: {
  organizationId: string;
  employees: SelectOption[];
  leaveTypes: SelectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [entitledDays, setEntitledDays] = useState("15.00");
  const [hasNoFixedAmount, setHasNoFixedAmount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!employeeId || !leaveTypeId) {
      setError("Select an employee and a leave type.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch("/api/leave-balances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        employeeId,
        leaveTypeId,
        year: Number(year),
        entitledDays: hasNoFixedAmount ? undefined : Number(entitledDays),
        hasNoFixedAmount,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create leave balance.");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  /** Always start from a clean slate — stale values/errors from a previous open shouldn't carry over, whether that session succeeded, failed, or was just closed. */
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setEmployeeId("");
      setLeaveTypeId("");
      setYear(String(new Date().getFullYear()));
      setEntitledDays("15.00");
      setHasNoFixedAmount(false);
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="leave-balances-create-button">
        <Plus className="size-3.5" />
        Grant balance
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant leave balance</DialogTitle>
        </DialogHeader>
        <form id="create-leave-balance-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect label="Employee" value={employeeId} onChange={setEmployeeId} options={employees} placeholder="Select an employee" required />
          <OptionSelect label="Leave type" value={leaveTypeId} onChange={setLeaveTypeId} options={leaveTypes} placeholder="Select a leave type" required />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Year" htmlFor="leave-balance-year" required>
              <Input id="leave-balance-year" type="number" value={year} onChange={(event) => setYear(event.target.value)} placeholder="e.g. 2026" required />
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
            <Checkbox
              checked={hasNoFixedAmount}
              onCheckedChange={(checked) => setHasNoFixedAmount(checked === true)}
              data-testid="leave-balance-no-fixed-amount"
            />
            No fixed balance (unlimited — employee can request this leave type freely)
          </label>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-leave-balance-form" disabled={isSubmitting} data-testid="leave-balances-create-submit-button">
            {isSubmitting ? "Granting…" : "Grant balance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
