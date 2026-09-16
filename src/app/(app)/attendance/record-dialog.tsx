"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Pencil } from "lucide-react";
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

function toTimeInput(value?: string | Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function RecordDialog({
  organizationId,
  employeeId,
  date,
  existingRecordId,
  initialCheckInAt,
  initialCheckOutAt,
  initialStatus,
  statusOptions,
}: {
  organizationId: string;
  employeeId: string;
  date: string;
  existingRecordId?: string;
  initialCheckInAt?: string | Date | null;
  initialCheckOutAt?: string | Date | null;
  initialStatus?: string | null;
  statusOptions: SelectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checkInTime, setCheckInTime] = useState(toTimeInput(initialCheckInAt));
  const [checkOutTime, setCheckOutTime] = useState(toTimeInput(initialCheckOutAt));
  const [status, setStatus] = useState(initialStatus ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    const checkInAt = checkInTime ? `${date}T${checkInTime}:00.000Z` : undefined;
    const checkOutAt = checkOutTime ? `${date}T${checkOutTime}:00.000Z` : undefined;

    const response = existingRecordId
      ? await fetch(`/api/attendance/${existingRecordId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, checkInAt, checkOutAt, status: status || undefined }),
        })
      : await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, employeeId, date, checkInAt, checkOutAt, status: status || undefined }),
        });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to save attendance.");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(buttonVariants({ variant: existingRecordId ? "outline" : "default", size: "sm" }))}
        data-testid={existingRecordId ? "attendance-adjust-button" : "attendance-record-button"}
      >
        {existingRecordId ? <Pencil className="size-3.5" /> : <Clock className="size-3.5" />}
        {existingRecordId ? "Adjust" : "Record"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existingRecordId ? "Adjust attendance" : "Record attendance"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Check-in" htmlFor="record-check-in">
              <Input id="record-check-in" type="time" value={checkInTime} onChange={(event) => setCheckInTime(event.target.value)} />
            </FormField>
            <FormField label="Check-out" htmlFor="record-check-out">
              <Input id="record-check-out" type="time" value={checkOutTime} onChange={(event) => setCheckOutTime(event.target.value)} />
            </FormField>
          </div>
          <OptionSelect label="Status override" value={status} onChange={setStatus} options={statusOptions} placeholder="Compute from check-in" />
          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="attendance-record-submit-button">
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
