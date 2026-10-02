"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
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
  currentPositionId,
  currentProjectId,
}: {
  employeeId: string;
  organizationId: string;
  positions: Option[];
  projects: Option[];
  currentPositionId?: string;
  currentProjectId?: string;
}) {
  const router = useRouter();
  // Pre-filled with the employee's current position/project — this
  // form represents where they are now, not a blank slate. Submitting only
  // sends whichever fields the viewer actually changed, so leaving
  // everything as-is (or picking the same values back) never wipes the
  // rest of the assignment the way an always-blank form used to.
  const [positionId, setPositionId] = useState(currentPositionId ?? "");
  const [projectId, setProjectId] = useState(currentProjectId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Position and project are required (same rule as the API).
  const allFieldsFilled = Boolean(positionId && projectId);

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
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to transfer employee.");
      return;
    }

    toast.success("Transfer saved");

    router.refresh();
  }

  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle className="text-base">Transfer</CardTitle>
        <CardDescription>
          Change this employee&apos;s position or project. Who they sit under is set on the org chart.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RequiredFieldsHint />
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 sm:items-end xl:grid-cols-1">
            <OptionSelect label="Position" value={positionId} onChange={setPositionId} options={positions} required />
            <OptionSelect label="Project" value={projectId} onChange={setProjectId} options={projects} required />
          </div>
          <Button type="submit" icon={ArrowRightLeft} pending={isSubmitting} pendingLabel="Transferring…" disabled={!allFieldsFilled} className="w-fit">
            Transfer
          </Button>
        </form>
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
