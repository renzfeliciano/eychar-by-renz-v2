"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

type ProjectOption = { id: string; label: string };

export function CreatePolicyDialog({ organizationId, projects }: { organizationId: string; projects: ProjectOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [standardStartTime, setStandardStartTime] = useState("09:00");
  const [standardEndTime, setStandardEndTime] = useState("18:00");
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/attendance-policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        name,
        projectId: projectId || undefined,
        standardStartTime,
        standardEndTime,
        gracePeriodMinutes: Number(gracePeriodMinutes),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create attendance policy.");
      return;
    }

    setName("");
    setProjectId("");
    setOpen(false);
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setName("");
      setProjectId("");
      setStandardStartTime("09:00");
      setStandardEndTime("18:00");
      setGracePeriodMinutes("10");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="attendance-policies-create-button">
        <Plus className="size-3.5" />
        Add policy
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add attendance policy</DialogTitle>
          <DialogDescription>Sets standard hours, grace period, and which org units or projects it applies to.</DialogDescription>
        </DialogHeader>
        <form id="create-attendance-policy-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Name" htmlFor="policy-name" required>
            <Input id="policy-name" placeholder="e.g. Standard Day Shift" value={name} onChange={(event) => setName(event.target.value)} required />
          </FormField>
          <OptionSelect label="Project" value={projectId} onChange={setProjectId} options={projects} placeholder="Org-wide" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Start time" htmlFor="policy-start" required>
              <Input id="policy-start" type="time" value={standardStartTime} onChange={(event) => setStandardStartTime(event.target.value)} required />
            </FormField>
            <FormField label="End time" htmlFor="policy-end" required>
              <Input id="policy-end" type="time" value={standardEndTime} onChange={(event) => setStandardEndTime(event.target.value)} required />
            </FormField>
          </div>
          <FormField label="Grace (min)" htmlFor="policy-grace" required>
            <Input id="policy-grace" type="number" min={0} placeholder="e.g. 15" value={gracePeriodMinutes} onChange={(event) => setGracePeriodMinutes(event.target.value)} required />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-attendance-policy-form" disabled={isSubmitting} data-testid="attendance-policies-create-submit-button">
            {isSubmitting ? "Adding…" : "Add policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
