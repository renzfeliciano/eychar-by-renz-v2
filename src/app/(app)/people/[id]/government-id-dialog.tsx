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
import { catalogChoiceOptions, type CatalogChoiceItem } from "@/domains/catalog/catalog-choice-options";
import type { GovernmentIdRecordView } from "@/domains/people/government-id-record-service";
import { useFieldErrors } from "@/lib/field-errors";
import { cn } from "@/lib/utils";

/** The dropdown's "Other" choice: HR types the ID's name instead of picking a catalog type. */
const OTHER = "__other__";

/**
 * Add a government ID to an employee's profile, or edit one (when `record` is given). The type comes from the
 * Government ID types catalog, or "Other (type a name)" when it is not listed; the number is required and the
 * validity date is optional. The API and service check the same rules.
 */
export function GovernmentIdDialog({
  organizationId,
  employeeId,
  employeeName,
  types,
  record,
}: {
  organizationId: string;
  employeeId: string;
  employeeName?: string;
  /** The Government ID types catalog; a type HR retired is still offered on the ID that uses it. */
  types: CatalogChoiceItem[];
  record?: GovernmentIdRecordView;
}) {
  const router = useRouter();
  const editing = Boolean(record);
  const suffix = record?.id ?? "new";
  const fieldIds = { typeCode: `government-id-type-${suffix}`, otherTypeName: `government-id-other-${suffix}`, idNumber: `government-id-number-${suffix}`, validUntil: `government-id-valid-${suffix}` } as const;
  const initialType = record ? (record.typeCode ?? OTHER) : "";
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(initialType);
  const [otherName, setOtherName] = useState(record?.otherTypeName ?? "");
  const [idNumber, setIdNumber] = useState(record?.idNumber ?? "");
  const [validUntil, setValidUntil] = useState(record?.validUntil ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, setFromResponse, setFieldError, clearField, clear } = useFieldErrors({ fieldIds });
  const isOther = type === OTHER;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setType(initialType);
      setOtherName(record?.otherTypeName ?? "");
      setIdNumber(record?.idNumber ?? "");
      setValidUntil(record?.validUntil ?? "");
      clear();
    }
    setOpen(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    if (!type) return setFieldError("typeCode", "Choose the ID type.");
    if (isOther && !otherName.trim()) return setFieldError("otherTypeName", "Type the name of the ID.");
    if (!idNumber.trim()) return setFieldError("idNumber", "Enter the ID number.");

    setIsSubmitting(true);
    const typeFields = isOther ? { otherTypeName: otherName.trim() } : { typeCode: type };
    // Adding leaves a blank date out; editing sends null, which is how the API clears it.
    const body = editing
      ? { organizationId, ...typeFields, idNumber: idNumber.trim(), validUntil: validUntil || null }
      : { organizationId, ...typeFields, idNumber: idNumber.trim(), ...(validUntil ? { validUntil } : {}) };
    const response = await fetch(editing ? `/api/employees/${employeeId}/government-ids/${record!.id}` : `/api/employees/${employeeId}/government-ids`, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      setFromResponse(await response.json().catch(() => ({})), editing ? "The ID wasn't saved. Try again." : "The ID wasn't added. Try again.");
      return;
    }

    setOpen(false);
    toast.success(editing ? "Government ID saved" : "Government ID added");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {editing ? (
        <DialogTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }))} aria-label="Edit government ID" data-testid={`government-id-edit-${record!.id}`}>
          <Pencil className="size-4" aria-hidden="true" />
        </DialogTrigger>
      ) : (
        <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="government-id-add-button">
          <Plus className="size-3.5" aria-hidden="true" />
          Add government ID
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit government ID" : "Add government ID"}</DialogTitle>
          <DialogDescription>
            {employeeName ? `An ID on ${employeeName}'s record.` : "An ID on this employee's record."} The valid-until date is optional.
          </DialogDescription>
        </DialogHeader>
        <form id={`government-id-form-${suffix}`} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect
            id={fieldIds.typeCode}
            label="ID type"
            value={type}
            onChange={(value) => {
              setType(value);
              clearField("typeCode");
            }}
            options={[...catalogChoiceOptions(types, record?.typeCode), { id: OTHER, label: "Other (type a name)" }]}
            placeholder="Choose an ID type"
            required
            error={fieldErrors.typeCode}
            testId="government-id-type"
          />
          {isOther && (
            <FormField label="Name of the ID" htmlFor={fieldIds.otherTypeName} required error={fieldErrors.otherTypeName}>
              <Input
                id={fieldIds.otherTypeName}
                value={otherName}
                onChange={(event) => {
                  setOtherName(event.target.value);
                  clearField("otherTypeName");
                }}
                maxLength={100}
                placeholder="e.g. Seaman's Book"
                data-testid="government-id-other-name"
              />
            </FormField>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="ID number" htmlFor={fieldIds.idNumber} required error={fieldErrors.idNumber}>
              <Input
                id={fieldIds.idNumber}
                value={idNumber}
                onChange={(event) => {
                  setIdNumber(event.target.value);
                  clearField("idNumber");
                }}
                maxLength={50}
                required
              />
            </FormField>
            <FormField label="Valid until" htmlFor={fieldIds.validUntil} error={fieldErrors.validUntil} description="Leave blank if it doesn't expire.">
              <Input
                id={fieldIds.validUntil}
                type="date"
                value={validUntil}
                onChange={(event) => {
                  setValidUntil(event.target.value);
                  clearField("validUntil");
                }}
              />
            </FormField>
          </div>
          {formError && <FormError message={formError} />}
        </form>
        <DialogFooter>
          <Button type="submit" form={`government-id-form-${suffix}`} icon={Save} pending={isSubmitting} pendingLabel="Saving…" data-testid="government-id-submit">
            {editing ? "Save changes" : "Add ID"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Removes one government ID after a confirmation. A client component, because the confirmation carries a function. */
export function RemoveGovernmentIdButton({ organizationId, employeeId, recordId, label }: { organizationId: string; employeeId: string; recordId: string; label: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const response = await fetch(`/api/employees/${employeeId}/government-ids/${recordId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "Couldn't remove it. Try again.");
    }
    toast.success("Government ID removed");
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="icon" aria-label="Remove government ID">
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      }
      title="Remove this ID?"
      description={`${label} will be removed from the employee's record. It can be added again.`}
      confirmLabel="Remove ID"
      confirmLoadingLabel="Removing…"
      onConfirm={handleConfirm}
      testId={`government-id-remove-${recordId}`}
    />
  );
}
