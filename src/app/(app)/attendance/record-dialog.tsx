"use client";

import { useState } from "react";
import { toast } from "sonner";
import { clockTime, zonedInstant } from "@/lib/app-time";
import { addDays } from "@/lib/date-key";
import { useRouter } from "next/navigation";
import { Clock, Pencil, Save } from "lucide-react";
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
import { FormField, FormError } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { Checkbox } from "@/components/ui/checkbox";
import { dayTypeLabel, formatMinutesShort } from "@/domains/attendance/day-result-labels";
import { cn } from "@/lib/utils";

/** The stored day result as the dialog shows it (attendance plan Phase 6). */
export type MeasuredDay = {
  workedMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
  nightDiffMinutes: number;
  dayType: string;
  flags: string[];
};

function toTimeInput(value?: string | Date | null): string {
  if (!value) return "";
  // The organization's clock both ways (see handleSubmit), so an edited time
  // round-trips to the same instant whatever the browser's timezone.
  return clockTime(value);
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
  measured,
  overtimeApproved = false,
  canApproveOvertime = false,
}: {
  organizationId: string;
  employeeId: string;
  date: string;
  existingRecordId?: string;
  initialCheckInAt?: string | Date | null;
  initialCheckOutAt?: string | Date | null;
  initialStatus?: string | null;
  statusOptions: SelectOption[];
  measured?: MeasuredDay | null;
  overtimeApproved?: boolean;
  /** attendance.update: overtime is approved through the adjust endpoint. */
  canApproveOvertime?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checkInTime, setCheckInTime] = useState(toTimeInput(initialCheckInAt));
  const [checkOutTime, setCheckOutTime] = useState(toTimeInput(initialCheckOutAt));
  const [status, setStatus] = useState(initialStatus ?? "");
  const [approved, setApproved] = useState(overtimeApproved);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    // No "Z"/offset here on purpose — a bare "YYYY-MM-DDTHH:mm:00" parses as
    // local time, matching what the admin actually typed into the (local)
    // time input above. Appending "Z" treated that local-looking value as
    // UTC instead, silently shifting the stored instant by the local
    // offset from what was intended.
    // A check-out at or before the check-in is the next morning: a night shift (final review).
    const checkOutDate = checkInTime && checkOutTime && checkOutTime <= checkInTime ? addDays(date, 1) : date;
    const checkInAt = checkInTime ? zonedInstant(date, checkInTime).toISOString() : undefined;
    const checkOutAt = checkOutTime ? zonedInstant(checkOutDate, checkOutTime).toISOString() : undefined;
    // An adjustment sends only the times HR changed, so approving overtime never rewrites them.
    const changedTimes = {
      ...(checkInTime !== toTimeInput(initialCheckInAt) ? { checkInAt } : {}),
      ...(checkOutTime !== toTimeInput(initialCheckOutAt) ? { checkOutAt } : {}),
    };

    const response = existingRecordId
      ? await fetch(`/api/attendance/${existingRecordId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, ...changedTimes, status: status || undefined, ...(approved !== overtimeApproved ? { overtimeApproved: approved } : {}) }),
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
    toast.success("Attendance saved");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setCheckInTime(toTimeInput(initialCheckInAt));
      setCheckOutTime(toTimeInput(initialCheckOutAt));
      setStatus(initialStatus ?? "");
      setApproved(overtimeApproved);
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(buttonVariants({ variant: existingRecordId ? "ghost" : "outline", size: "sm" }))}
        data-testid={existingRecordId ? "attendance-adjust-button" : "attendance-record-button"}
      >
        {existingRecordId ? <Pencil className="size-3.5" /> : <Clock className="size-3.5" />}
        {existingRecordId ? "Adjust" : "Record"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existingRecordId ? "Adjust attendance" : "Record attendance"}</DialogTitle>
          <DialogDescription>
            {existingRecordId ? "Corrects an already-recorded check-in or check-out for this date." : "Logs an employee's check-in and check-out for the selected date."}
          </DialogDescription>
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
          {existingRecordId && measured && (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm" data-testid="attendance-measured">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Measured</span>
                <span className="text-xs text-muted-foreground">{dayTypeLabel(measured.dayType)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {[
                  ["Worked", measured.workedMinutes],
                  ["Late", measured.lateMinutes],
                  ["Undertime", measured.undertimeMinutes],
                  ["Overtime", measured.overtimeMinutes],
                  ["Night", measured.nightDiffMinutes],
                ].map(([label, minutes]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="tabular-nums">{formatMinutesShort(Number(minutes))}</dd>
                  </div>
                ))}
              </dl>
              {measured.flags.includes("missing_checkout") && <p className="text-xs text-muted-foreground">No check-out yet: no hours count until it&apos;s added.</p>}
              {canApproveOvertime && measured.overtimeMinutes > 0 && (
                <label className="flex items-center gap-2">
                  <Checkbox checked={approved} onCheckedChange={(checked) => setApproved(checked === true)} />
                  Approve {formatMinutesShort(measured.overtimeMinutes)} of overtime
                  <span className="text-xs text-muted-foreground">(payroll pays only approved overtime)</span>
                </label>
              )}
            </div>
          )}
          <OptionSelect label="Status override" value={status} onChange={setStatus} options={statusOptions} placeholder="Compute from check-in" />
          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} data-testid="attendance-record-submit-button" icon={Save} pending={isSubmitting} pendingLabel="Saving…">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
