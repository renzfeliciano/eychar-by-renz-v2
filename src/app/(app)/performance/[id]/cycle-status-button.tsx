"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    if (response.ok) router.refresh();
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={isSubmitting} data-testid={`review-cycle-${nextStatus}-button`}>
      {isSubmitting ? loadingLabel : label}
    </Button>
  );
}
