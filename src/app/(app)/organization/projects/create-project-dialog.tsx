"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

type LocationOption = { id: string; name: string };

export function CreateProjectDialog({ organizationId, locations }: { organizationId: string; locations: LocationOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="projects-create-button">
        <Plus className="size-3.5" />
        Add project
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add project</DialogTitle>
        </DialogHeader>
        <form id="create-project-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-project-form" disabled={isSubmitting} data-testid="projects-create-submit-button">
            {isSubmitting ? "Adding…" : "Add project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
