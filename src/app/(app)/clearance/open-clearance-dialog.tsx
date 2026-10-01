"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2, UserMinus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

/**
 * HR opens a clearance once the separation notice is on file. Resignations
 * arrive by email, not through the app (ADR-031), so the form records how
 * and when the notice came in.
 */
export function OpenClearanceDialog({
  organizationId,
  employees,
  separationTypes,
  todayKey,
}: {
  organizationId: string;
  employees: SelectOption[];
  separationTypes: SelectOption[];
  todayKey: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [separationTypeCode, setSeparationTypeCode] = useState("");
  const [noticeDate, setNoticeDate] = useState(todayKey);
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [noticeReference, setNoticeReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function reset() {
    setEmployeeId("");
    setSeparationTypeCode("");
    setNoticeDate(todayKey);
    setLastWorkingDay("");
    setNoticeReference("");
    setRemarks("");
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeeId || !separationTypeCode) {
      setError("Select the employee and the separation type.");
      return;
    }
    if (!noticeDate || !lastWorkingDay) {
      setError("Enter the notice date and the last working day.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const response = await fetch("/api/clearance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        employeeId,
        separationTypeCode,
        noticeDate,
        lastWorkingDay,
        noticeReference: noticeReference.trim() || undefined,
        remarks: remarks.trim() || undefined,
      }),
    });
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to open the clearance.");
      return;
    }
    const { clearance } = await response.json();
    setOpen(false);
    toast.success("Clearance opened");
    router.push(`/clearance/${clearance._id}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="clearance-open-button">
        <UserMinus className="size-3.5" />
        Open clearance
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open clearance</DialogTitle>
          <DialogDescription>Starts the departments&apos; checklist for a separating employee. Due dates count from the last working day.</DialogDescription>
        </DialogHeader>
        <form id="open-clearance-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect label="Employee" value={employeeId} onChange={setEmployeeId} options={employees} placeholder="Select an employee" testId="clearance-employee-select" required />
          <OptionSelect
            label="Separation type"
            value={separationTypeCode}
            onChange={setSeparationTypeCode}
            options={separationTypes}
            placeholder="Select a separation type"
            testId="clearance-type-select"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Notice received" htmlFor="clearance-notice-date" required>
              <Input id="clearance-notice-date" type="date" value={noticeDate} onChange={(event) => setNoticeDate(event.target.value)} required />
            </FormField>
            <FormField label="Last working day" htmlFor="clearance-last-day" required>
              <Input id="clearance-last-day" type="date" value={lastWorkingDay} min={noticeDate || undefined} onChange={(event) => setLastWorkingDay(event.target.value)} required />
            </FormField>
          </div>
          <FormField label="How notice was received" htmlFor="clearance-notice-reference">
            <Input
              id="clearance-notice-reference"
              value={noticeReference}
              onChange={(event) => setNoticeReference(event.target.value)}
              placeholder="e.g. Resignation letter by email, 28 Sep 2026"
              maxLength={200}
            />
          </FormField>
          <FormField label="Remarks" htmlFor="clearance-remarks">
            <Textarea id="clearance-remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="e.g. Turnover to be coordinated with the site supervisor" maxLength={1000} />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="open-clearance-form" disabled={isSubmitting} data-testid="clearance-open-submit-button">
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Opening…" : "Open clearance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
