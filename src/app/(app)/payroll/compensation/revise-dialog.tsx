"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { FormField, FormError } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

export function ReviseDialog({
  organizationId,
  employeeId,
  currentBaseSalary,
  currentAllowanceAmount,
}: {
  organizationId: string;
  employeeId: string;
  currentBaseSalary: number;
  currentAllowanceAmount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [baseSalary, setBaseSalary] = useState(String(currentBaseSalary));
  const [allowanceAmount, setAllowanceAmount] = useState(String(currentAllowanceAmount));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/compensation/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, baseSalary: Number(baseSalary), allowanceAmount: Number(allowanceAmount) }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to revise compensation.");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setBaseSalary(String(currentBaseSalary));
      setAllowanceAmount(String(currentAllowanceAmount));
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="compensation-revise-button">
        <Pencil className="size-3.5" />
        Revise
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revise compensation</DialogTitle>
          <DialogDescription>Changes the amount of an existing compensation component going forward.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField label="Base salary / period" htmlFor="revise-base-salary">
            <Input id="revise-base-salary" type="number" min={0} placeholder="e.g. 25000" value={baseSalary} onChange={(event) => setBaseSalary(event.target.value)} />
          </FormField>
          <FormField label="Allowance / period" htmlFor="revise-allowance">
            <Input id="revise-allowance" type="number" min={0} placeholder="e.g. 2000" value={allowanceAmount} onChange={(event) => setAllowanceAmount(event.target.value)} />
          </FormField>
          <FormError message={error} />
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="compensation-revise-submit-button">
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
