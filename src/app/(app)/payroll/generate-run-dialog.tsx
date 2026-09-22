"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

type AdjustmentRow = { employeeId: string; category: string; direction: "addition" | "deduction"; amount: string };

const DIRECTION_OPTIONS: SelectOption[] = [
  { id: "addition", label: "Addition" },
  { id: "deduction", label: "Deduction" },
];

const EMPTY_ADJUSTMENT: AdjustmentRow = { employeeId: "", category: "", direction: "addition", amount: "" };

export function GenerateRunDialog({ organizationId, employees }: { organizationId: string; employees: SelectOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [payPeriodStart, setPayPeriodStart] = useState("");
  const [payPeriodEnd, setPayPeriodEnd] = useState("");
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateAdjustment(index: number, patch: Partial<AdjustmentRow>) {
    setAdjustments(adjustments.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleSubmit() {
    setError(null);
    if (!payPeriodStart || !payPeriodEnd) {
      setError("Pay period start and end are required.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch("/api/payroll-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        payPeriodStart,
        payPeriodEnd,
        adjustments: adjustments
          .filter((row) => row.employeeId && row.category && row.amount)
          .map((row) => ({ ...row, amount: Number(row.amount) })),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to generate payroll run.");
      return;
    }

    setPayPeriodStart("");
    setPayPeriodEnd("");
    setAdjustments([]);
    setOpen(false);
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setPayPeriodStart("");
      setPayPeriodEnd("");
      setAdjustments([]);
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="payroll-generate-run-button">
        <Plus className="size-3.5" />
        Generate run
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate payroll run</DialogTitle>
          <DialogDescription>Computes pay for the selected period from resolved policy and attendance — review before approving.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Pay period start" htmlFor="run-period-start" required>
              <Input id="run-period-start" type="date" value={payPeriodStart} onChange={(event) => setPayPeriodStart(event.target.value)} />
            </FormField>
            <FormField label="Pay period end" htmlFor="run-period-end" required>
              <Input id="run-period-end" type="date" value={payPeriodEnd} onChange={(event) => setPayPeriodEnd(event.target.value)} />
            </FormField>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Adjustments (overtime, holiday pay, bonus, loans, ...)</p>
            {adjustments.map((row, index) => (
              <div key={index} className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
                <OptionSelect
                  label="Employee"
                  value={row.employeeId}
                  onChange={(value) => updateAdjustment(index, { employeeId: value })}
                  options={employees}
                  placeholder="Select"
                />
                <FormField label="Category">
                  <Input value={row.category} onChange={(event) => updateAdjustment(index, { category: event.target.value })} placeholder="overtime" />
                </FormField>
                <OptionSelect
                  label="Direction"
                  value={row.direction}
                  onChange={(value) => updateAdjustment(index, { direction: (value || "addition") as "addition" | "deduction" })}
                  options={DIRECTION_OPTIONS}
                  placeholder="Addition"
                />
                <FormField label="Amount">
                  <Input type="number" min={0} value={row.amount} onChange={(event) => updateAdjustment(index, { amount: event.target.value })} />
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove adjustment ${index + 1}`}
                  onClick={() => setAdjustments(adjustments.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setAdjustments([...adjustments, { ...EMPTY_ADJUSTMENT }])}
            >
              <Plus className="size-3.5" />
              Add adjustment
            </Button>
          </div>

          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="payroll-generate-run-submit-button">
            {isSubmitting ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
