"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
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
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm", variant: "outline" }))} data-testid="performance-review-submit-button">
        <ClipboardCheck className="size-3.5" />
        Submit
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit review</DialogTitle>
        </DialogHeader>
        <form id={`submit-review-form-${reviewId}`} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <OptionSelect label="Rating" value={ratingCode} onChange={setRatingCode} options={ratings} placeholder="Select a rating" />
          <FormField label="Comments (optional)" htmlFor={`review-comments-${reviewId}`}>
            <Input id={`review-comments-${reviewId}`} value={comments} onChange={(event) => setComments(event.target.value)} />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form={`submit-review-form-${reviewId}`} disabled={isSubmitting} data-testid="performance-review-submit-confirm-button">
            {isSubmitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
