"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";

export function CreateCompensationForm({ organizationId, employees }: { organizationId: string; employees: SelectOption[] }) {
  const router = useRouter();
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
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <OptionSelect label="Employee" value={employeeId} onChange={setEmployeeId} options={employees} placeholder="Select an employee" />
          <FormField label="Base salary / period" htmlFor="compensation-base-salary">
            <Input id="compensation-base-salary" type="number" min={0} value={baseSalary} onChange={(event) => setBaseSalary(event.target.value)} required />
          </FormField>
          <FormField label="Allowance / period" htmlFor="compensation-allowance">
            <Input id="compensation-allowance" type="number" min={0} value={allowanceAmount} onChange={(event) => setAllowanceAmount(event.target.value)} />
          </FormField>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isSubmitting ? "Granting…" : "Grant compensation"}
          </Button>
        </form>
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
