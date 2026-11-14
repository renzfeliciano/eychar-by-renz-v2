"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { SearchableOptionSelect } from "@/components/shared/searchable-option-select";
import { OptionSelect } from "@/components/shared/option-select";
import type { SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

export type ComplaintFormValue = {
  id: string;
  employeeId: string;
  receivedDate: string;
  remarks?: string | null;
  projectId?: string | null;
  description?: string | null;
  what?: string | null;
  where?: string | null;
  incidentDate?: string | null;
  complainantName?: string | null;
};

function toDateInputValue(value?: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

type FormState = {
  employeeId: string;
  receivedDate: string;
  projectId: string;
  description: string;
  what: string;
  where: string;
  incidentDate: string;
  complainantName: string;
  remarks: string;
};

const blankState = (complaint?: ComplaintFormValue): FormState => ({
  employeeId: complaint?.employeeId ?? "",
  receivedDate: toDateInputValue(complaint?.receivedDate),
  projectId: complaint?.projectId ?? "",
  description: complaint?.description ?? "",
  what: complaint?.what ?? "",
  where: complaint?.where ?? "",
  incidentDate: toDateInputValue(complaint?.incidentDate),
  complainantName: complaint?.complainantName ?? "",
  remarks: complaint?.remarks ?? "",
});

/** One form, two modes, like Recruitment's applicant dialog: add a complaint, or fully edit one. */
export function ComplaintFormDialog({
  organizationId,
  employees,
  projects,
  initialComplaint,
}: {
  organizationId: string;
  employees: SelectOption[];
  /** The organization's projects (Organization > Projects); the complaint's project is picked from these. */
  projects: SelectOption[];
  initialComplaint?: ComplaintFormValue;
}) {
  const isEdit = Boolean(initialComplaint);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => blankState(initialComplaint));
  const set = (key: keyof FormState, value: string) => setForm((state) => ({ ...state, [key]: value }));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.employeeId) {
      setError("Select the employee the complaint is about.");
      return;
    }
    if (!form.receivedDate) {
      setError("Enter the date the complaint was received.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch(isEdit ? `/api/complaints/${initialComplaint!.id}` : "/api/complaints", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      // Blank values are sent as blank: on an edit that is how a field is cleared.
      body: JSON.stringify({ organizationId, ...form }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? `Failed to ${isEdit ? "save" : "add"} complaint.`);
      return;
    }

    if (!isEdit) setForm(blankState());
    toast.success(isEdit ? "Complaint updated" : "Complaint added");
    setOpen(false);
    router.refresh();
  }

  const formId = `complaint-form-${initialComplaint?.id ?? "new"}`;
  // A project that was deleted or deactivated since is not on the list; keep it selectable so saving does not drop it.
  const projectOptions =
    initialComplaint?.projectId && !projects.some((project) => project.id === initialComplaint.projectId)
      ? [{ id: initialComplaint.projectId, label: "Unknown project (record removed)" }, ...projects]
      : projects;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setForm(blankState(initialComplaint));
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(isEdit ? buttonVariants({ size: "sm", variant: "ghost" }) : buttonVariants({ size: "sm" }))}
        aria-label={isEdit ? "Edit complaint" : undefined}
        data-testid={isEdit ? "complaint-edit-button" : "complaints-create-button"}
      >
        {isEdit ? (
          <Pencil className="size-3.5" />
        ) : (
          <>
            <Plus className="size-3.5" />
            Add complaint
          </>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit complaint" : "Add complaint"}</DialogTitle>
          <DialogDescription>{isEdit ? "Updates who the complaint is about, when it was received, and the incident details." : "Logs an incident report or complaint about an employee. It starts in the first stage."}</DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <SearchableOptionSelect
            label="Employee the complaint is about"
            value={form.employeeId}
            onChange={(next) => set("employeeId", next)}
            options={employees}
            placeholder="Search by name…"
            emptyMessage="No employee matches that name."
            required
            testId="complaint-form-employee"
          />
          <FormField label="Date received" htmlFor={`${formId}-received`} required>
            <Input id={`${formId}-received`} type="date" value={form.receivedDate} onChange={(event) => set("receivedDate", event.target.value)} required />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <OptionSelect id={`${formId}-project`} label="Project/Site" value={form.projectId} onChange={(next) => set("projectId", next)} options={projectOptions} placeholder="None" testId="complaint-form-project" />
            <FormField label="Complainant name" htmlFor={`${formId}-complainant`}>
              <Input id={`${formId}-complainant`} value={form.complainantName} onChange={(event) => set("complainantName", event.target.value)} maxLength={200} />
            </FormField>
          </div>
          <FormField label="Brief description" htmlFor={`${formId}-description`}>
            <Textarea id={`${formId}-description`} value={form.description} onChange={(event) => set("description", event.target.value)} maxLength={1000} />
          </FormField>
          <FormField label="What" htmlFor={`${formId}-what`}>
            <Textarea id={`${formId}-what`} value={form.what} onChange={(event) => set("what", event.target.value)} maxLength={1000} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Where" htmlFor={`${formId}-where`}>
              <Input id={`${formId}-where`} value={form.where} onChange={(event) => set("where", event.target.value)} maxLength={300} />
            </FormField>
            <FormField label="Date of incident" htmlFor={`${formId}-incident-date`}>
              <Input id={`${formId}-incident-date`} type="date" value={form.incidentDate} onChange={(event) => set("incidentDate", event.target.value)} />
            </FormField>
          </div>
          <FormField label="Remarks" htmlFor={`${formId}-remarks`}>
            <Textarea id={`${formId}-remarks`} value={form.remarks} onChange={(event) => set("remarks", event.target.value)} placeholder="e.g. Employee / Unit owner / Tenant / Affiliate" maxLength={1000} />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form={formId}
            icon={isEdit ? Check : Plus}
            pending={isSubmitting}
            pendingLabel={isEdit ? "Saving…" : "Adding…"}
            data-testid={isEdit ? "complaint-save-button" : "complaints-create-submit-button"}
          >
            {isEdit ? "Save changes" : "Add complaint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
