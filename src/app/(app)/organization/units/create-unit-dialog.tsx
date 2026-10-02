"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { OptionSelect } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

type UnitOption = { id: string; name: string };

export function CreateUnitDialog({ organizationId, units }: { organizationId: string; units: UnitOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    setOpen(false);
    toast.success("Unit added");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setName("");
      setCode("");
      setType("");
      setParentUnitId("");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(buttonVariants({ size: "sm" }))}
        data-testid="organization-units-create-button"
      >
        <Plus className="size-3.5" />
        Add unit
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add organization unit</DialogTitle>
          <DialogDescription>Adds a division, department, or team to the org structure.</DialogDescription>
        </DialogHeader>
        <form id="create-unit-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Name" htmlFor="unit-name" required>
            <Input id="unit-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Human Resources" required />
          </FormField>
          <FormField label="Code" htmlFor="unit-code" required>
            <Input id="unit-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. HR" required />
          </FormField>
          <FormField label="Type" htmlFor="unit-type" required>
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
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-unit-form" data-testid="organization-units-create-submit-button" icon={Plus} pending={isSubmitting} pendingLabel="Adding…">
            Add unit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
