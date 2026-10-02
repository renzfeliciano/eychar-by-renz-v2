"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Pencil, Save } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

export type EditableProject = { id: string; name: string; description: string | null; locationId: string | null };

export function EditProjectDialog({
  organizationId,
  project,
  locations,
}: {
  organizationId: string;
  project: EditableProject;
  locations: SelectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [locationId, setLocationId] = useState(project.locationId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // Pre-filled form; "" clears description/location on the server.
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, description: description.trim(), locationId }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to update project.");
      return;
    }

    setOpen(false);
    toast.success("Project updated");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setName(project.name);
      setDescription(project.description ?? "");
      setLocationId(project.locationId ?? "");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        aria-label={`Edit ${project.name}`}
        data-testid={`projects-edit-button-${project.id}`}
      >
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>Employees clock in at this project&apos;s location, within that location&apos;s radius.</DialogDescription>
        </DialogHeader>
        <form id={`edit-project-form-${project.id}`} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Name" htmlFor={`project-edit-name-${project.id}`} required>
            <Input id={`project-edit-name-${project.id}`} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. EGI Rufino" required />
          </FormField>
          <FormField label="Description" htmlFor={`project-edit-description-${project.id}`}>
            <Input
              id={`project-edit-description-${project.id}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Building administration for EGI Rufino Tower"
            />
          </FormField>
          <OptionSelect label="Location" value={locationId} onChange={setLocationId} options={locations} testId={`projects-edit-location-${project.id}`} />
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form={`edit-project-form-${project.id}`} data-testid="projects-edit-submit-button" icon={Save} pending={isSubmitting} pendingLabel="Saving…">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
