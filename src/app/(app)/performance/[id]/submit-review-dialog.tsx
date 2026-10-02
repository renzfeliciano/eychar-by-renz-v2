"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

export function SubmitReviewDialog({
  organizationId,
  reviewId,
  ratings,
}: {
  organizationId: string;
  reviewId: string;
  ratings: SelectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ratingCode, setRatingCode] = useState("");
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!ratingCode) {
      setError("Select a rating.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch(`/api/performance-reviews/${reviewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, ratingCode, comments: comments || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to submit review.");
      return;
    }

    setOpen(false);
    toast.success("Review submitted");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setRatingCode("");
      setComments("");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm", variant: "outline" }))} data-testid="performance-review-submit-button">
        <ClipboardCheck className="size-3.5" />
        Submit
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit review</DialogTitle>
          <DialogDescription>Finalizes this review — it can&apos;t be edited after submitting.</DialogDescription>
        </DialogHeader>
        <form id={`submit-review-form-${reviewId}`} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect label="Rating" value={ratingCode} onChange={setRatingCode} options={ratings} placeholder="Select a rating" required />
          <FormField label="Comments" htmlFor={`review-comments-${reviewId}`}>
            <Textarea id={`review-comments-${reviewId}`} value={comments} onChange={(event) => setComments(event.target.value)} placeholder="e.g. Consistently exceeds expectations, strong collaboration skills" />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form={`submit-review-form-${reviewId}`} data-testid="performance-review-submit-confirm-button" icon={Send} pending={isSubmitting} pendingLabel="Submitting…">
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
