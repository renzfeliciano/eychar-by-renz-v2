"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

/** HR's switch: unused days of this leave type are paid out in the final settlement (ADR-032). */
export function ConvertibleToggle({ organizationId, leaveTypeId, name, checked, disabled }: { organizationId: string; leaveTypeId: string; name: string; checked: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(checked);
  const [busy, setBusy] = useState(false);

  async function handleChange(next: boolean) {
    setValue(next);
    setBusy(true);
    const response = await fetch(`/api/leave-types/${leaveTypeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, convertibleAtSeparation: next }),
    });
    setBusy(false);
    if (!response.ok) {
      setValue(!next);
      const body = await response.json().catch(() => ({}));
      return toast.error(body.error ?? "Couldn't update the leave type.");
    }
    toast.success(next ? `${name}: paid out at separation` : `${name}: not paid out at separation`);
    router.refresh();
  }

  return <Checkbox checked={value} onCheckedChange={(next) => handleChange(next === true)} disabled={disabled || busy} aria-label={`Pay out unused ${name} at separation`} />;
}
