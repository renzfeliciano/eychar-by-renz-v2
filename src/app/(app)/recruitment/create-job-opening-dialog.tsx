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
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

export function CreateJobOpeningDialog({ organizationId, positions }: { organizationId: string; positions: SelectOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [positionId, setPositionId] = useState("");
  const [headcount, setHeadcount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!positionId) {
      setError("Select a position.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch("/api/job-openings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, positionId, headcount: Number(headcount) }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create job opening.");
      return;
    }

    setPositionId("");
    setHeadcount("1");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="job-openings-create-button">
        <Plus className="size-3.5" />
        Add job opening
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add job opening</DialogTitle>
        </DialogHeader>
        <form id="create-job-opening-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <OptionSelect label="Position" value={positionId} onChange={setPositionId} options={positions} placeholder="Select a position" />
          <FormField label="Headcount" htmlFor="job-opening-headcount">
            <Input id="job-opening-headcount" type="number" min={1} value={headcount} onChange={(event) => setHeadcount(event.target.value)} required />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-job-opening-form" disabled={isSubmitting} data-testid="job-openings-create-submit-button">
            {isSubmitting ? "Adding…" : "Add job opening"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
