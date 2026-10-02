"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { iconForAction } from "@/components/ui/action-icon";
import { Button } from "@/components/ui/button";

export function CycleStatusButton({
  reviewCycleId,
  organizationId,
  nextStatus,
  label,
  loadingLabel,
}: {
  reviewCycleId: string;
  organizationId: string;
  nextStatus: "open" | "closed";
  label: string;
  loadingLabel: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleClick() {
    setIsSubmitting(true);
    const response = await fetch(`/api/review-cycles/${reviewCycleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, status: nextStatus }),
    });
    setIsSubmitting(false);
    if (response.ok) {
      toast.success("Review cycle updated");
      router.refresh();
    } else {
      const body = await response.json().catch(() => ({}));
      toast.error(body.error ?? "Couldn't update the review cycle.");
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} icon={iconForAction(label)} pending={isSubmitting} pendingLabel={loadingLabel} data-testid={`review-cycle-${nextStatus}-button`}>
      {label}
    </Button>
  );
}
