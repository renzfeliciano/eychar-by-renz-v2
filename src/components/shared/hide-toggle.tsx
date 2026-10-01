"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The Super Administrator's "hide as test data" switch (ADR-034): a hidden
 * record disappears for everyone else (lists, counts, payroll, exports) but
 * stays visible here, marked Hidden. Render it only for the Super
 * Administrator; the server checks again.
 */
export function HideToggle({ organizationId, type, id, label, hidden }: { organizationId: string; type: string; id: string; label: string; hidden: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const response = await fetch("/api/visibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, type, id, hidden: !hidden }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return toast.error(body.error ?? "Couldn't change its visibility.");
    toast.success(hidden ? `${label} is visible again` : `${label} is hidden`, { description: hidden ? undefined : "Only you can see it now. Unhide it any time." });
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-1">
      {hidden && <span className="rounded-full border border-dashed px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">Hidden</span>}
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={toggle}
        disabled={busy}
        aria-label={hidden ? `Unhide ${label}` : `Hide ${label} from everyone else`}
        title={hidden ? "Unhide (show to everyone again)" : "Hide from everyone else (test data)"}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : hidden ? <Eye className="size-3.5" aria-hidden="true" /> : <EyeOff className="size-3.5" aria-hidden="true" />}
      </Button>
    </span>
  );
}
