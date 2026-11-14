"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";
import { educationLevelOptions, type EducationLevelItem } from "@/domains/catalog/education-level-options";
import type { EducationRecordView } from "@/domains/people/education-record-service";
import { useFieldErrors } from "@/lib/field-errors";
import { cn } from "@/lib/utils";

const EARLIEST_YEAR = 1900;

/**
 * Add an entry to an employee's Educational background, or edit one (when `record` is given). Level, school,
 * course and year graduated; the course and year are optional. The API and service check the same rules.
 */
export function EducationRecordDialog({
  organizationId,
  employeeId,
  employeeName,
  levels,
  record,
}: {
  organizationId: string;
  employeeId: string;
  employeeName?: string;
  /** The Education levels catalog; a level HR retired is still offered on the entry that uses it. */
  levels: EducationLevelItem[];
  record?: EducationRecordView;
}) {
  const router = useRouter();
  const editing = Boolean(record);
  const suffix = record?.id ?? "new";
  const fieldIds = { levelCode: `education-level-${suffix}`, school: `education-school-${suffix}`, course: `education-course-${suffix}`, yearGraduated: `education-year-${suffix}` } as const;
  const [open, setOpen] = useState(false);
  const [levelCode, setLevelCode] = useState(record?.levelCode ?? "");
  const [school, setSchool] = useState(record?.school ?? "");
  const [course, setCourse] = useState(record?.course ?? "");
  const [year, setYear] = useState(record?.yearGraduated ? String(record.yearGraduated) : "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, setFromResponse, setFieldError, clearField, clear } = useFieldErrors({ fieldIds });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setLevelCode(record?.levelCode ?? "");
      setSchool(record?.school ?? "");
      setCourse(record?.course ?? "");
      setYear(record?.yearGraduated ? String(record.yearGraduated) : "");
      clear();
    }
    setOpen(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    const latestYear = new Date().getFullYear() + 1;
    const yearText = year.trim();
    const yearValue = yearText ? Number(yearText) : undefined;
    if (!levelCode) return setFieldError("levelCode", "Choose a level.");
    if (!school.trim()) return setFieldError("school", "Enter the school.");
    if (yearValue !== undefined && (!Number.isInteger(yearValue) || yearValue < EARLIEST_YEAR || yearValue > latestYear)) {
      return setFieldError("yearGraduated", `Enter a four-digit year between ${EARLIEST_YEAR} and ${latestYear}.`);
    }

    setIsSubmitting(true);
    // Adding leaves blanks out; editing sends them as "" and null, which is how the API clears a field.
    const body = editing
      ? { organizationId, levelCode, school: school.trim(), course: course.trim(), yearGraduated: yearValue ?? null }
      : { organizationId, levelCode, school: school.trim(), ...(course.trim() ? { course: course.trim() } : {}), ...(yearValue !== undefined ? { yearGraduated: yearValue } : {}) };
    const response = await fetch(editing ? `/api/employees/${employeeId}/education/${record!.id}` : `/api/employees/${employeeId}/education`, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      setFromResponse(await response.json().catch(() => ({})), editing ? "The entry wasn't saved. Try again." : "The entry wasn't added. Try again.");
      return;
    }

    setOpen(false);
    toast.success(editing ? "Education entry saved" : "Education entry added");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {editing ? (
        <DialogTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }))} aria-label="Edit education entry" data-testid={`education-edit-${record!.id}`}>
          <Pencil className="size-4" aria-hidden="true" />
        </DialogTrigger>
      ) : (
        <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="education-add-button">
          <Plus className="size-3.5" aria-hidden="true" />
          Add education
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit education entry" : "Add education"}</DialogTitle>
          <DialogDescription>
            {employeeName ? `A school or qualification on ${employeeName}'s record.` : "A school or qualification on this employee's record."} Course and year are optional.
          </DialogDescription>
        </DialogHeader>
        <form id={`education-form-${suffix}`} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect
            id={fieldIds.levelCode}
            label="Level"
            value={levelCode}
            onChange={(value) => {
              setLevelCode(value);
              clearField("levelCode");
            }}
            options={educationLevelOptions(levels, record?.levelCode)}
            placeholder="Choose a level"
            required
            error={fieldErrors.levelCode}
            testId="education-level"
          />
          <FormField label="School" htmlFor={fieldIds.school} required error={fieldErrors.school}>
            <Input
              id={fieldIds.school}
              value={school}
              onChange={(event) => {
                setSchool(event.target.value);
                clearField("school");
              }}
              maxLength={200}
              placeholder="e.g. University of the Philippines - Manila"
              required
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <FormField label="Course or degree" htmlFor={fieldIds.course} error={fieldErrors.course} description="Leave blank for elementary and high school.">
                <Input id={fieldIds.course} value={course} onChange={(event) => setCourse(event.target.value)} maxLength={200} placeholder="e.g. BS Accountancy" />
              </FormField>
            </div>
            <FormField label="Year graduated" htmlFor={fieldIds.yearGraduated} error={fieldErrors.yearGraduated} description="Leave blank if not graduated.">
              <Input
                id={fieldIds.yearGraduated}
                inputMode="numeric"
                value={year}
                onChange={(event) => {
                  setYear(event.target.value);
                  clearField("yearGraduated");
                }}
                placeholder="e.g. 2014"
              />
            </FormField>
          </div>
          {formError && <FormError message={formError} />}
        </form>
        <DialogFooter>
          <Button type="submit" form={`education-form-${suffix}`} icon={Save} pending={isSubmitting} pendingLabel="Saving…" data-testid="education-submit">
            {editing ? "Save changes" : "Add entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Removes one entry after a confirmation. A client component, because the confirmation carries a function. */
export function RemoveEducationButton({ organizationId, employeeId, recordId, label }: { organizationId: string; employeeId: string; recordId: string; label: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const response = await fetch(`/api/employees/${employeeId}/education/${recordId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "Couldn't remove it. Try again.");
    }
    toast.success("Education entry removed");
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="icon" aria-label="Remove education entry">
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      }
      title="Remove this entry?"
      description={`${label} will be removed from the employee's record. It can be added again.`}
      confirmLabel="Remove entry"
      confirmLoadingLabel="Removing…"
      onConfirm={handleConfirm}
      testId={`education-remove-${recordId}`}
    />
  );
}
