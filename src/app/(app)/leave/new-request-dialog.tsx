"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useFieldErrors } from "@/lib/field-errors";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

/** API field → the control it's about, for field-level errors (see useFieldErrors). */
const LEAVE_REQUEST_FIELD_IDS = {
  startDate: "request-start-date",
  endDate: "request-end-date",
  reason: "request-reason",
  employeeId: "request-employee",
  leaveTypeId: "request-leave-type",
} as const;

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
  const { fieldErrors, formError: error, setFormError: setError, setFromResponse } = useFieldErrors({ fieldIds: LEAVE_REQUEST_FIELD_IDS });
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
      setFromResponse(body, "Failed to submit leave request.");
      return;
    }

    setEmployeeId("");
    setLeaveTypeId("");
    setStartDate("");
    setEndDate("");
    setReason("");
    setOpen(false);
    toast.success("Leave request filed");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setEmployeeId("");
      setLeaveTypeId("");
      setStartDate("");
      setEndDate("");
      setReason("");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="leave-new-request-button">
        <Plus className="size-3.5" />
        New request
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New leave request</DialogTitle>
          <DialogDescription>Files a leave request on behalf of an employee, for approval.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect id="request-employee" error={fieldErrors.employeeId} label="Employee" value={employeeId} onChange={setEmployeeId} options={employees} placeholder="Select an employee" required />
          <OptionSelect id="request-leave-type" error={fieldErrors.leaveTypeId} label="Leave type" value={leaveTypeId} onChange={setLeaveTypeId} options={leaveTypes} placeholder="Select a leave type" required />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Start date" htmlFor="request-start-date" error={fieldErrors.startDate} required>
              <Input id="request-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </FormField>
            <FormField label="End date" htmlFor="request-end-date" error={fieldErrors.endDate} required>
              <Input id="request-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </FormField>
          </div>
          <FormField label="Reason" htmlFor="request-reason" error={fieldErrors.reason}>
            <Textarea id="request-reason" placeholder="e.g. Family emergency" value={reason} onChange={(event) => setReason(event.target.value)} />
          </FormField>
          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} data-testid="leave-new-request-submit-button" icon={Send} pending={isSubmitting} pendingLabel="Submitting…">
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
