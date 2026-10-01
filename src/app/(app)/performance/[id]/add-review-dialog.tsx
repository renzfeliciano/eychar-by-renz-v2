"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

export function AddReviewDialog({
  organizationId,
  reviewCycleId,
  employees,
}: {
  organizationId: string;
  reviewCycleId: string;
  employees: SelectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!employeeId || !reviewerId) {
      setError("Select both an employee and a reviewer.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch("/api/performance-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, reviewCycleId, employeeId, reviewerId }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to add review.");
      return;
    }

    setEmployeeId("");
    setReviewerId("");
    setOpen(false);
    toast.success("Review added");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setEmployeeId("");
      setReviewerId("");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="performance-reviews-create-button">
        <Plus className="size-3.5" />
        Add review
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add review</DialogTitle>
          <DialogDescription>Records a performance review for this employee within the cycle.</DialogDescription>
        </DialogHeader>
        <form id="add-review-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect label="Employee" value={employeeId} onChange={setEmployeeId} options={employees} placeholder="Select an employee" required />
          <OptionSelect label="Reviewer" value={reviewerId} onChange={setReviewerId} options={employees} placeholder="Select a reviewer" required />
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="add-review-form" disabled={isSubmitting} data-testid="performance-reviews-create-submit-button">
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Adding…" : "Add review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
