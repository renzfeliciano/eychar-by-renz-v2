"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";

export function CreatePayrollPolicyForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
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
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isSubmitting ? "Adding…" : "Add policy"}
          </Button>
        </form>
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
