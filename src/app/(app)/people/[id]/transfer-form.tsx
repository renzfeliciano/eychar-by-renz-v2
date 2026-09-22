"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";

type Option = { id: string; label: string };

export function TransferForm({
  employeeId,
  organizationId,
  positions,
  projects,
  managers,
  currentPositionId,
  currentProjectId,
  currentReportsToEmployeeId,
}: {
  employeeId: string;
  organizationId: string;
  positions: Option[];
  projects: Option[];
  managers: Option[];
  currentPositionId?: string;
  currentProjectId?: string;
  currentReportsToEmployeeId?: string;
}) {
  const router = useRouter();
  // Pre-filled with the employee's current position/project/manager — this
  // form represents where they are now, not a blank slate. Submitting only
  // sends whichever fields the viewer actually changed, so leaving
  // everything as-is (or picking the same values back) never wipes the
  // rest of the assignment the way an always-blank form used to.
  const [positionId, setPositionId] = useState(currentPositionId ?? "");
  const [projectId, setProjectId] = useState(currentProjectId ?? "");
  const [reportsToEmployeeId, setReportsToEmployeeId] = useState(currentReportsToEmployeeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Position, project, and manager are all required on every assignment,
  // no exceptions — matches the same rule the API enforces server-side.
  const allFieldsFilled = Boolean(positionId && projectId && reportsToEmployeeId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/employees/${employeeId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        positionId: positionId !== (currentPositionId ?? "") ? positionId || undefined : undefined,
        projectId: projectId !== (currentProjectId ?? "") ? projectId || undefined : undefined,
        reportsToEmployeeId:
          reportsToEmployeeId !== (currentReportsToEmployeeId ?? "") ? reportsToEmployeeId || undefined : undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to transfer employee.");
      return;
    }

    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transfer</CardTitle>
        <CardDescription>
          Change this employee&apos;s position, project, or manager — position, project, and manager must all be set to complete a
          transfer.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RequiredFieldsHint />
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
            <OptionSelect label="Position" value={positionId} onChange={setPositionId} options={positions} required />
            <OptionSelect label="Project" value={projectId} onChange={setProjectId} options={projects} required />
            <OptionSelect label="Manager" value={reportsToEmployeeId} onChange={setReportsToEmployeeId} options={managers} required />
          </div>
          <Button type="submit" disabled={isSubmitting || !allFieldsFilled} className="w-fit">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />}
            {isSubmitting ? "Transferring…" : "Transfer"}
          </Button>
        </form>
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
