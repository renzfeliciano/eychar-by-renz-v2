"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Removes a manual line from a draft settlement (recorded in the audit log). */
export function RemoveLineButton({ organizationId, settlementId, lineId, label }: { organizationId: string; settlementId: string; lineId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    const response = await fetch(`/api/final-settlements/${settlementId}/lines/${lineId}?organizationId=${organizationId}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return toast.error(body.error ?? "Couldn't remove the line.");
    router.refresh();
  }

  return (
    <Button size="icon-sm" variant="ghost" onClick={handleClick} disabled={busy} aria-label={`Remove ${label}`}>
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
    </Button>
  );
}
