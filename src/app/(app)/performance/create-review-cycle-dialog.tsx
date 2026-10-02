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
import { cn } from "@/lib/utils";

export function CreateReviewCycleDialog({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/review-cycles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, periodStart, periodEnd }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create review cycle.");
      return;
    }

    setName("");
    setPeriodStart("");
    setPeriodEnd("");
    setOpen(false);
    toast.success("Review cycle created");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setName("");
      setPeriodStart("");
      setPeriodEnd("");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="review-cycles-create-button">
        <Plus className="size-3.5" />
        Add review cycle
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add review cycle</DialogTitle>
          <DialogDescription>Opens a new performance review period for the organization.</DialogDescription>
        </DialogHeader>
        <form id="create-review-cycle-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Name" htmlFor="review-cycle-name" required>
            <Input id="review-cycle-name" placeholder="e.g. 2026 Annual Review" value={name} onChange={(event) => setName(event.target.value)} required />
          </FormField>
          <FormField label="Period start" htmlFor="review-cycle-start" required>
            <Input id="review-cycle-start" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required />
          </FormField>
          <FormField label="Period end" htmlFor="review-cycle-end" required>
            <Input id="review-cycle-end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-review-cycle-form" data-testid="review-cycles-create-submit-button" icon={Plus} pending={isSubmitting} pendingLabel="Adding…">
            Add review cycle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
