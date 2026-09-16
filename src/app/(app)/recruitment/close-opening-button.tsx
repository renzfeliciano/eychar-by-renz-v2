"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CloseOpeningButton({ jobOpeningId, organizationId }: { jobOpeningId: string; organizationId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleClick() {
    setIsSubmitting(true);
    const response = await fetch(`/api/job-openings/${jobOpeningId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, status: "closed" }),
    });
    setIsSubmitting(false);
    if (response.ok) router.refresh();
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={isSubmitting} data-testid="job-openings-close-button">
      <Ban className="size-3.5" />
      {isSubmitting ? "Closing…" : "Close opening"}
    </Button>
  );
}
