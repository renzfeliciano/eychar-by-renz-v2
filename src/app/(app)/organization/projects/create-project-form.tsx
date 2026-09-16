"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";

type LocationOption = { id: string; name: string };

export function CreateProjectForm({ organizationId, locations }: { organizationId: string; locations: LocationOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [locationId, setLocationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, code, locationId: locationId || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create project.");
      return;
    }

    setName("");
    setCode("");
    setLocationId("");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <FormField label="Name" htmlFor="project-name">
            <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </FormField>
          <FormField label="Code" htmlFor="project-code">
            <Input id="project-code" value={code} onChange={(event) => setCode(event.target.value)} required />
          </FormField>
          <OptionSelect
            label="Location"
            value={locationId}
            onChange={setLocationId}
            options={locations.map((location) => ({ id: location.id, label: location.name }))}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isSubmitting ? "Adding…" : "Add project"}
          </Button>
        </form>
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
