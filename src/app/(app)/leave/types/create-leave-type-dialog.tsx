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
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

export function CreateLeaveTypeDialog({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="leave-types-create-button">
        <Plus className="size-3.5" />
        Add leave type
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add leave type</DialogTitle>
        </DialogHeader>
        <form id="create-leave-type-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Name" htmlFor="leave-type-name" required>
            <Input id="leave-type-name" placeholder="e.g. Vacation Leave" value={name} onChange={(event) => setName(event.target.value)} required />
          </FormField>
          <FormField label="Code" htmlFor="leave-type-code" required>
            <Input id="leave-type-code" placeholder="e.g. VL" value={code} onChange={(event) => setCode(event.target.value)} required />
          </FormField>
          <FormField label="Description" htmlFor="leave-type-description">
            <Input id="leave-type-description" placeholder="e.g. Paid time off for rest and personal matters" value={description} onChange={(event) => setDescription(event.target.value)} />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-leave-type-form" disabled={isSubmitting} data-testid="leave-types-create-submit-button">
            {isSubmitting ? "Adding…" : "Add leave type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
