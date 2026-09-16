"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";

type UnitOption = { id: string; name: string };

export function CreatePositionForm({ organizationId, units }: { organizationId: string; units: UnitOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [organizationUnitId, setOrganizationUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, title, code, organizationUnitId: organizationUnitId || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create position.");
      return;
    }

    setTitle("");
    setCode("");
    setOrganizationUnitId("");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <FormField label="Title" htmlFor="position-title">
            <Input id="position-title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </FormField>
          <FormField label="Code" htmlFor="position-code">
            <Input id="position-code" value={code} onChange={(event) => setCode(event.target.value)} required />
          </FormField>
          <OptionSelect
            label="Organization unit"
            value={organizationUnitId}
            onChange={setOrganizationUnitId}
            options={units.map((unit) => ({ id: unit.id, label: unit.name }))}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isSubmitting ? "Adding…" : "Add position"}
          </Button>
        </form>
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
