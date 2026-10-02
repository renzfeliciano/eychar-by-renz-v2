"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
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

  async function setVisibility(hide: boolean, { undoable }: { undoable: boolean }) {
    setBusy(true);
    const response = await fetch("/api/visibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, type, id, hidden: hide }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return toast.error(body.error ?? "Couldn't change its visibility.");
    if (hide) {
      toast.success(`${label} is hidden`, {
        description: "Only you can see it now.",
        // Hiding is one click away from a mistake, so it can be taken back right here.
        ...(undoable ? { action: { label: "Undo", onClick: () => void setVisibility(false, { undoable: false }) } } : {}),
      });
    } else {
      toast.success(`${label} is visible again`);
    }
    router.refresh();
  }

  const toggle = () => setVisibility(!hidden, { undoable: true });

  return (
    <span className="inline-flex items-center gap-1">
      {hidden && <span className="rounded-full border border-dashed px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">Hidden</span>}
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={toggle}
        icon={hidden ? Eye : EyeOff}
        pending={busy}
        aria-label={hidden ? `Unhide ${label}` : `Hide ${label} from everyone else`}
        title={hidden ? "Unhide (show to everyone again)" : "Hide from everyone else (test data)"}
      />
    </span>
  );
}
