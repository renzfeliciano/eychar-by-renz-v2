"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
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
          <OptionSelect label="Employee" value={employeeId} onChange={setEmployeeId} options={employees} placeholder="Select an employee" required />
          <OptionSelect label="Leave type" value={leaveTypeId} onChange={setLeaveTypeId} options={leaveTypes} placeholder="Select a leave type" required />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Start date" htmlFor="request-start-date" required>
              <Input id="request-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </FormField>
            <FormField label="End date" htmlFor="request-end-date" required>
              <Input id="request-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </FormField>
          </div>
          <FormField label="Reason" htmlFor="request-reason">
            <Textarea id="request-reason" placeholder="e.g. Family emergency" value={reason} onChange={(event) => setReason(event.target.value)} />
          </FormField>
          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="leave-new-request-submit-button">
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
