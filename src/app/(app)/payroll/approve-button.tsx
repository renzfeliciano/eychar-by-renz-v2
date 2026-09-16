"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ApproveButton({ runId, organizationId }: { runId: string; organizationId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleApprove() {
    setIsSubmitting(true);
    const response = await fetch(`/api/payroll-runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, action: "approve" }),
    });
    setIsSubmitting(false);
    if (response.ok) router.refresh();
  }

  return (
    <Button size="sm" variant="outline" onClick={handleApprove} disabled={isSubmitting} data-testid="payroll-approve-run-button">
      <Check className="size-3.5" />
      {isSubmitting ? "Approving…" : "Approve"}
    </Button>
  );
}
