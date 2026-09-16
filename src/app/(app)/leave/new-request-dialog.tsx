"use client";

import { useState } from "react";
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

export function NewRequestDialog({
  organizationId,
  employees,
  leaveTypes,
}: {
  organizationId: string;
  employees: SelectOption[];
  leaveTypes: SelectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!employeeId || !leaveTypeId || !startDate || !endDate) {
      setError("Employee, leave type, and both dates are required.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch("/api/leave-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, employeeId, leaveTypeId, startDate, endDate, reason: reason || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to submit leave request.");
      return;
    }

    setEmployeeId("");
    setLeaveTypeId("");
    setStartDate("");
    setEndDate("");
    setReason("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="leave-new-request-button">
        <Plus className="size-3.5" />
        New request
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New leave request</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <OptionSelect label="Employee" value={employeeId} onChange={setEmployeeId} options={employees} placeholder="Select an employee" />
          <OptionSelect label="Leave type" value={leaveTypeId} onChange={setLeaveTypeId} options={leaveTypes} placeholder="Select a leave type" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Start date" htmlFor="request-start-date">
              <Input id="request-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </FormField>
            <FormField label="End date" htmlFor="request-end-date">
              <Input id="request-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </FormField>
          </div>
          <FormField label="Reason (optional)" htmlFor="request-reason">
            <Input id="request-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </FormField>
          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="leave-new-request-submit-button">
            {isSubmitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
