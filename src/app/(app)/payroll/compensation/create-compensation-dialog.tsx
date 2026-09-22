"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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

export function CreateCompensationDialog({ organizationId, employees }: { organizationId: string; employees: SelectOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [allowanceAmount, setAllowanceAmount] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!employeeId) {
      setError("Select an employee.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch("/api/compensation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        employeeId,
        baseSalary: Number(baseSalary),
        allowanceAmount: Number(allowanceAmount || 0),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to grant compensation.");
      return;
    }

    setEmployeeId("");
    setBaseSalary("");
    setAllowanceAmount("0");
    setOpen(false);
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setEmployeeId("");
      setBaseSalary("");
      setAllowanceAmount("0");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="compensation-create-button">
        <Plus className="size-3.5" />
        Grant compensation
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant compensation</DialogTitle>
          <DialogDescription>Adds a pay component — allowance, bonus, or deduction — to an employee&apos;s compensation.</DialogDescription>
        </DialogHeader>
        <form id="create-compensation-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect label="Employee" value={employeeId} onChange={setEmployeeId} options={employees} placeholder="Select an employee" required />
          <FormField label="Base salary / period" htmlFor="compensation-base-salary" required>
            <Input id="compensation-base-salary" type="number" min={0} placeholder="e.g. 25000" value={baseSalary} onChange={(event) => setBaseSalary(event.target.value)} required />
          </FormField>
          <FormField label="Allowance / period" htmlFor="compensation-allowance">
            <Input id="compensation-allowance" type="number" min={0} placeholder="e.g. 2000" value={allowanceAmount} onChange={(event) => setAllowanceAmount(event.target.value)} />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-compensation-form" disabled={isSubmitting} data-testid="compensation-create-submit-button">
            {isSubmitting ? "Granting…" : "Grant compensation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
