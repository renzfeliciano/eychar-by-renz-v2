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

export function CreateUnitForm({ organizationId, units }: { organizationId: string; units: UnitOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState("");
  const [parentUnitId, setParentUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/organization-units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, code, type, parentUnitId: parentUnitId || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create organization unit.");
      return;
    }

    setName("");
    setCode("");
    setType("");
    setParentUnitId("");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <FormField label="Name" htmlFor="unit-name">
            <Input id="unit-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </FormField>
          <FormField label="Code" htmlFor="unit-code">
            <Input id="unit-code" value={code} onChange={(event) => setCode(event.target.value)} required />
          </FormField>
          <FormField label="Type" htmlFor="unit-type">
            <Input
              id="unit-type"
              placeholder="e.g. department"
              value={type}
              onChange={(event) => setType(event.target.value)}
              required
            />
          </FormField>
          <OptionSelect
            label="Parent unit"
            value={parentUnitId}
            onChange={setParentUnitId}
            options={units.map((unit) => ({ id: unit.id, label: unit.name }))}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isSubmitting ? "Adding…" : "Add unit"}
          </Button>
        </form>
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
