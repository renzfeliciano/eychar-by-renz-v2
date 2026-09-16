"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";

export function CreateLeavePolicyForm({
  organizationId,
  leaveTypes,
  projects,
}: {
  organizationId: string;
  leaveTypes: SelectOption[];
  projects: SelectOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [annualEntitlementDays, setAnnualEntitlementDays] = useState("15");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!leaveTypeId) {
      setError("Select a leave type.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch("/api/leave-policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        leaveTypeId,
        name,
        projectId: projectId || undefined,
        annualEntitlementDays: Number(annualEntitlementDays),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create leave policy.");
      return;
    }

    setName("");
    setProjectId("");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <FormField label="Name" htmlFor="leave-policy-name">
            <Input id="leave-policy-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </FormField>
          <OptionSelect label="Leave type" value={leaveTypeId} onChange={setLeaveTypeId} options={leaveTypes} placeholder="Select a leave type" />
          <OptionSelect label="Project (optional)" value={projectId} onChange={setProjectId} options={projects} placeholder="Org-wide" />
          <FormField label="Annual entitlement (days)" htmlFor="leave-policy-days">
            <Input
              id="leave-policy-days"
              type="number"
              min={0}
              value={annualEntitlementDays}
              onChange={(event) => setAnnualEntitlementDays(event.target.value)}
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
