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

export function CreatePositionDialog({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, title }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create position.");
      return;
    }

    setTitle("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="positions-create-button">
        <Plus className="size-3.5" />
        Add position
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add position</DialogTitle>
        </DialogHeader>
        <form id="create-position-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Title" htmlFor="position-title" required>
            <Input id="position-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Front Desk Staff" required />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-position-form" disabled={isSubmitting} data-testid="positions-create-submit-button">
            {isSubmitting ? "Adding…" : "Add position"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
