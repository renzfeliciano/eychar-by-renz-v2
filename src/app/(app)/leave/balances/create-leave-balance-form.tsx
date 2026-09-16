"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";

export function CreateLeaveBalanceForm({
  organizationId,
  employees,
  leaveTypes,
}: {
  organizationId: string;
  employees: SelectOption[];
  leaveTypes: SelectOption[];
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [entitledDays, setEntitledDays] = useState("15");
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
        entitledDays: Number(entitledDays),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create leave balance.");
      return;
    }

    setEmployeeId("");
    setLeaveTypeId("");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <OptionSelect label="Employee" value={employeeId} onChange={setEmployeeId} options={employees} placeholder="Select an employee" />
          <OptionSelect label="Leave type" value={leaveTypeId} onChange={setLeaveTypeId} options={leaveTypes} placeholder="Select a leave type" />
          <FormField label="Year" htmlFor="leave-balance-year">
            <Input id="leave-balance-year" type="number" value={year} onChange={(event) => setYear(event.target.value)} required />
          </FormField>
          <FormField label="Entitled days" htmlFor="leave-balance-days">
            <Input
              id="leave-balance-days"
              type="number"
              min={0}
              value={entitledDays}
              onChange={(event) => setEntitledDays(event.target.value)}
              required
            />
          </FormField>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isSubmitting ? "Adding…" : "Grant balance"}
          </Button>
        </form>
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
