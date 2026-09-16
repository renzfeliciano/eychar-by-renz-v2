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
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

export function CreatePayrollPolicyDialog({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [payFrequency, setPayFrequency] = useState("monthly");
  const [standardWorkDaysPerPeriod, setStandardWorkDaysPerPeriod] = useState("22");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/payroll-policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        name,
        payFrequency,
        standardWorkDaysPerPeriod: Number(standardWorkDaysPerPeriod),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create payroll policy.");
      return;
    }

    setName("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="payroll-policies-create-button">
        <Plus className="size-3.5" />
        Add policy
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add payroll policy</DialogTitle>
        </DialogHeader>
        <form id="create-payroll-policy-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Name" htmlFor="payroll-policy-name">
            <Input id="payroll-policy-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </FormField>
          <FormField label="Pay frequency" htmlFor="payroll-policy-frequency">
            <Input id="payroll-policy-frequency" value={payFrequency} onChange={(event) => setPayFrequency(event.target.value)} required />
          </FormField>
          <FormField label="Standard work days / period" htmlFor="payroll-policy-days">
            <Input
              id="payroll-policy-days"
              type="number"
              min={1}
              value={standardWorkDaysPerPeriod}
              onChange={(event) => setStandardWorkDaysPerPeriod(event.target.value)}
              required
            />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-payroll-policy-form" disabled={isSubmitting} data-testid="payroll-policies-create-submit-button">
            {isSubmitting ? "Adding…" : "Add policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
