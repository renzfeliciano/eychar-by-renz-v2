"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";

export function CreateLeaveTypeForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/leave-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, code, description: description || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create leave type.");
      return;
    }

    setName("");
    setCode("");
    setDescription("");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <FormField label="Name" htmlFor="leave-type-name">
            <Input id="leave-type-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </FormField>
          <FormField label="Code" htmlFor="leave-type-code">
            <Input id="leave-type-code" value={code} onChange={(event) => setCode(event.target.value)} required />
          </FormField>
          <FormField label="Description" htmlFor="leave-type-description">
            <Input id="leave-type-description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </FormField>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isSubmitting ? "Adding…" : "Add leave type"}
          </Button>
        </form>
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
