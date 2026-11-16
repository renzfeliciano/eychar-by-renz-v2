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
import type { ProfessionalLicenseRecordView } from "@/domains/people/professional-license-record-service";
import { useFieldErrors } from "@/lib/field-errors";
import { cn } from "@/lib/utils";

/**
 * Add a PRC license to an employee's profile, or edit one (when `record` is given). The profession comes from
 * the PRC professions catalog; the number is required and the expiry date is optional. The API and service
 * check the same rules.
 */
export function PrcLicenseDialog({
  organizationId,
  employeeId,
  employeeName,
  professions,
  record,
}: {
  organizationId: string;
  employeeId: string;
  employeeName?: string;
  /** The PRC professions catalog; a profession HR retired is still offered on the license that uses it. */
  professions: CatalogChoiceItem[];
  record?: ProfessionalLicenseRecordView;
}) {
  const router = useRouter();
  const editing = Boolean(record);
  const suffix = record?.id ?? "new";
  const fieldIds = { professionCode: `prc-license-profession-${suffix}`, licenseNumber: `prc-license-number-${suffix}`, validUntil: `prc-license-valid-${suffix}` } as const;
  const [open, setOpen] = useState(false);
  const [professionCode, setProfessionCode] = useState(record?.professionCode ?? "");
  const [licenseNumber, setLicenseNumber] = useState(record?.licenseNumber ?? "");
  const [validUntil, setValidUntil] = useState(record?.validUntil ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, setFromResponse, setFieldError, clearField, clear } = useFieldErrors({ fieldIds });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setProfessionCode(record?.professionCode ?? "");
      setLicenseNumber(record?.licenseNumber ?? "");
      setValidUntil(record?.validUntil ?? "");
      clear();
    }
    setOpen(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    if (!professionCode) return setFieldError("professionCode", "Choose the profession.");
    if (!licenseNumber.trim()) return setFieldError("licenseNumber", "Enter the license number.");

    setIsSubmitting(true);
    // Adding leaves a blank date out; editing sends null, which is how the API clears it.
    const body = editing
      ? { organizationId, professionCode, licenseNumber: licenseNumber.trim(), validUntil: validUntil || null }
      : { organizationId, professionCode, licenseNumber: licenseNumber.trim(), ...(validUntil ? { validUntil } : {}) };
    const response = await fetch(editing ? `/api/employees/${employeeId}/prc-licenses/${record!.id}` : `/api/employees/${employeeId}/prc-licenses`, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      setFromResponse(await response.json().catch(() => ({})), editing ? "The license wasn't saved. Try again." : "The license wasn't added. Try again.");
      return;
    }

    setOpen(false);
    toast.success(editing ? "PRC license saved" : "PRC license added");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {editing ? (
        <DialogTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }))} aria-label="Edit PRC license" data-testid={`prc-license-edit-${record!.id}`}>
          <Pencil className="size-4" aria-hidden="true" />
        </DialogTrigger>
      ) : (
        <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="prc-license-add-button">
          <Plus className="size-3.5" aria-hidden="true" />
          Add PRC license
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit PRC license" : "Add PRC license"}</DialogTitle>
          <DialogDescription>
            {employeeName ? `A professional license on ${employeeName}'s record.` : "A professional license on this employee's record."} The valid-until date is optional.
          </DialogDescription>
        </DialogHeader>
        <form id={`prc-license-form-${suffix}`} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect
            id={fieldIds.professionCode}
            label="Profession"
            value={professionCode}
            onChange={(value) => {
              setProfessionCode(value);
              clearField("professionCode");
            }}
            options={catalogChoiceOptions(professions, record?.professionCode)}
            placeholder="Choose a profession"
            required
            error={fieldErrors.professionCode}
            testId="prc-license-profession"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="License number" htmlFor={fieldIds.licenseNumber} required error={fieldErrors.licenseNumber}>
              <Input
                id={fieldIds.licenseNumber}
                value={licenseNumber}
                onChange={(event) => {
                  setLicenseNumber(event.target.value);
                  clearField("licenseNumber");
                }}
                maxLength={50}
                required
              />
            </FormField>
            <FormField label="Valid until" htmlFor={fieldIds.validUntil} error={fieldErrors.validUntil} description="The expiration date, if the license has one.">
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
          <Button type="submit" form={`prc-license-form-${suffix}`} icon={Save} pending={isSubmitting} pendingLabel="Saving…" data-testid="prc-license-submit">
            {editing ? "Save changes" : "Add license"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Removes one PRC license after a confirmation. A client component, because the confirmation carries a function. */
export function RemovePrcLicenseButton({ organizationId, employeeId, recordId, label }: { organizationId: string; employeeId: string; recordId: string; label: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const response = await fetch(`/api/employees/${employeeId}/prc-licenses/${recordId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "Couldn't remove it. Try again.");
    }
    toast.success("PRC license removed");
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="icon" aria-label="Remove PRC license">
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      }
      title="Remove this license?"
      description={`${label} will be removed from the employee's record. It can be added again.`}
      confirmLabel="Remove license"
      confirmLoadingLabel="Removing…"
      onConfirm={handleConfirm}
      testId={`prc-license-remove-${recordId}`}
    />
  );
}
