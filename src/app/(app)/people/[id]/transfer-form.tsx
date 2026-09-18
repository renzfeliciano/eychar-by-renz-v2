"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";

type Option = { id: string; label: string };

export function TransferForm({
  employeeId,
  organizationId,
  positions,
  projects,
  managers,
}: {
  employeeId: string;
  organizationId: string;
  positions: Option[];
  projects: Option[];
  managers: Option[];
}) {
  const router = useRouter();
  const [positionId, setPositionId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [reportsToEmployeeId, setReportsToEmployeeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/employees/${employeeId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        positionId: positionId || undefined,
        projectId: projectId || undefined,
        reportsToEmployeeId: reportsToEmployeeId || undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to transfer employee.");
      return;
    }

    setPositionId("");
    setProjectId("");
    setReportsToEmployeeId("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transfer</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="grid gap-4 sm:grid-cols-3 sm:items-end">
          <OptionSelect label="New position" value={positionId} onChange={setPositionId} options={positions} />
          <OptionSelect label="New project" value={projectId} onChange={setProjectId} options={projects} />
          <OptionSelect label="New manager" value={reportsToEmployeeId} onChange={setReportsToEmployeeId} options={managers} />
          <Button type="submit" disabled={isSubmitting} className="sm:col-span-3 sm:justify-self-start">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />}
            {isSubmitting ? "Transferring…" : "Transfer"}
          </Button>
        </form>
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
