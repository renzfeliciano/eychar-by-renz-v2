"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Runs the same idempotent "prepare what's due" pass as the daily cron, on demand. */
export function PrepareNowButton({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function prepare() {
    setBusy(true);
    const response = await fetch("/api/payroll-schedules/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return toast.error(body.error ?? "Couldn't prepare the due runs.");
    const outcomes: { outcome: string; runNumber?: string }[] = body.outcomes ?? [];
    const prepared = outcomes.filter((outcome) => outcome.outcome === "prepared");
    const failed = outcomes.filter((outcome) => outcome.outcome === "failed").length;
    if (prepared.length) toast.success(`Prepared ${prepared.map((outcome) => outcome.runNumber).join(", ")}`);
    else if (!failed) toast.info("Everything due is already prepared.");
    if (failed) toast.error(`${failed} schedule${failed === 1 ? "" : "s"} couldn't prepare a run. See the note on each.`);
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" onClick={prepare} data-testid="payroll-schedules-prepare-now" icon={PlayCircle} pending={busy} pendingLabel="Preparing…">
      Prepare due runs
    </Button>
  );
}
