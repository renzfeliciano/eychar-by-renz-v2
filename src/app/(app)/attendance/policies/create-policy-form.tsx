"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";

type ProjectOption = { id: string; label: string };

export function CreatePolicyForm({ organizationId, projects }: { organizationId: string; projects: ProjectOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [standardStartTime, setStandardStartTime] = useState("09:00");
  const [standardEndTime, setStandardEndTime] = useState("18:00");
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/attendance-policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        name,
        projectId: projectId || undefined,
        standardStartTime,
        standardEndTime,
        gracePeriodMinutes: Number(gracePeriodMinutes),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create attendance policy.");
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
          <FormField label="Name" htmlFor="policy-name">
            <Input id="policy-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </FormField>
          <OptionSelect label="Project (optional)" value={projectId} onChange={setProjectId} options={projects} placeholder="Org-wide" />
          <FormField label="Start time" htmlFor="policy-start">
            <Input id="policy-start" type="time" value={standardStartTime} onChange={(event) => setStandardStartTime(event.target.value)} required />
          </FormField>
          <FormField label="End time" htmlFor="policy-end">
            <Input id="policy-end" type="time" value={standardEndTime} onChange={(event) => setStandardEndTime(event.target.value)} required />
          </FormField>
          <FormField label="Grace (min)" htmlFor="policy-grace">
            <Input id="policy-grace" type="number" min={0} value={gracePeriodMinutes} onChange={(event) => setGracePeriodMinutes(event.target.value)} required />
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
