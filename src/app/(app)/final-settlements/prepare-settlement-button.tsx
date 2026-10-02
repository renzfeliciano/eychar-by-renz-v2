"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prepares the final settlement for a clearance (or opens it if one exists) and goes to it. */
export function PrepareSettlementButton({ organizationId, clearanceCaseId, existingId }: { organizationId: string; clearanceCaseId: string; existingId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (existingId) return router.push(`/final-settlements/${existingId}`);
    setBusy(true);
    const response = await fetch("/api/final-settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, clearanceCaseId }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return toast.error(body.error ?? "Couldn't prepare the final settlement.");
    router.push(`/final-settlements/${body.settlement._id}`);
  }

  return (
    <Button size="sm" onClick={handleClick} icon={Calculator} pending={busy} pendingLabel="Preparing…">
      {existingId ? "Open final settlement" : "Prepare final settlement"}
    </Button>
  );
}
