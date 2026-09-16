"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";

type Option = { id: string; label: string };

export function HireForm({
  organizationId,
  positions,
  projects,
  managers,
}: {
  organizationId: string;
  positions: Option[];
  projects: Option[];
  managers: Option[];
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [positionId, setPositionId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [reportsToEmployeeId, setReportsToEmployeeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        firstName,
        lastName,
        employeeNumber,
        employmentType,
        positionId: positionId || undefined,
        projectId: projectId || undefined,
        reportsToEmployeeId: reportsToEmployeeId || undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to hire employee.");
      return;
    }

    router.push("/people");
  }

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" htmlFor="hire-first-name">
              <Input id="hire-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
            </FormField>
            <FormField label="Last name" htmlFor="hire-last-name">
              <Input id="hire-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Employee number" htmlFor="hire-employee-number">
              <Input
                id="hire-employee-number"
                value={employeeNumber}
                onChange={(event) => setEmployeeNumber(event.target.value)}
                required
              />
            </FormField>
            <FormField label="Employment type" htmlFor="hire-employment-type">
              <Input
                id="hire-employment-type"
                placeholder="e.g. regular"
                value={employmentType}
                onChange={(event) => setEmploymentType(event.target.value)}
                required
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <OptionSelect
              label="Position"
              value={positionId}
              onChange={setPositionId}
              options={positions}
            />
            <OptionSelect
              label="Project"
              value={projectId}
              onChange={setProjectId}
              options={projects}
            />
          </div>
          <OptionSelect
            label="Reports to"
            value={reportsToEmployeeId}
            onChange={setReportsToEmployeeId}
            options={managers}
          />

          <FormError message={error} />

          <Button type="submit" disabled={isSubmitting} className="self-start">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            {isSubmitting ? "Hiring…" : "Hire employee"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
