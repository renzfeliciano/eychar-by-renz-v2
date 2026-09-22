"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Package } from "lucide-react";
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

const CONDITION_OPTIONS: SelectOption[] = [
  { id: "Good", label: "Good" },
  { id: "Fair", label: "Fair" },
  { id: "Damaged", label: "Damaged" },
  { id: "Lost", label: "Lost" },
];

function toDateInputValue(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export type AssetIssuanceFormValue = {
  id: string;
  assetName: string;
  assetType?: string | null;
  serialNumber?: string | null;
  condition: string;
  issuedDate: string;
  returnedDate?: string | null;
  remarks?: string | null;
};

export function AssetIssuanceFormDialog({
  organizationId,
  employeeId,
  initialValue,
}: {
  organizationId: string;
  employeeId: string;
  initialValue?: AssetIssuanceFormValue;
}) {
  const isEdit = Boolean(initialValue);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assetName, setAssetName] = useState(initialValue?.assetName ?? "");
  const [assetType, setAssetType] = useState(initialValue?.assetType ?? "");
  const [serialNumber, setSerialNumber] = useState(initialValue?.serialNumber ?? "");
  const [condition, setCondition] = useState(initialValue?.condition ?? "Good");
  const [issuedDate, setIssuedDate] = useState(toDateInputValue(initialValue?.issuedDate));
  const [returnedDate, setReturnedDate] = useState(toDateInputValue(initialValue?.returnedDate));
  const [remarks, setRemarks] = useState(initialValue?.remarks ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(
      isEdit ? `/api/employees/${employeeId}/asset-issuances/${initialValue!.id}` : `/api/employees/${employeeId}/asset-issuances`,
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          assetName,
          assetType: assetType || undefined,
          serialNumber: serialNumber || undefined,
          condition,
          issuedDate,
          returnedDate: returnedDate || undefined,
          remarks: remarks || undefined,
        }),
      },
    );

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? `Failed to ${isEdit ? "save" : "log"} asset issuance.`);
      return;
    }

    if (!isEdit) {
      setAssetName("");
      setAssetType("");
      setSerialNumber("");
      setCondition("Good");
      setIssuedDate("");
      setReturnedDate("");
      setRemarks("");
    }
    setOpen(false);
    router.refresh();
  }

  const formId = `asset-issuance-form-${initialValue?.id ?? "new"}`;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setAssetName(initialValue?.assetName ?? "");
      setAssetType(initialValue?.assetType ?? "");
      setSerialNumber(initialValue?.serialNumber ?? "");
      setCondition(initialValue?.condition ?? "Good");
      setIssuedDate(toDateInputValue(initialValue?.issuedDate));
      setReturnedDate(toDateInputValue(initialValue?.returnedDate));
      setRemarks(initialValue?.remarks ?? "");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(isEdit ? buttonVariants({ size: "sm", variant: "ghost" }) : buttonVariants({ size: "sm" }))}
        aria-label={isEdit ? "Edit asset issuance" : undefined}
        data-testid={isEdit ? "asset-issuance-edit-button" : "asset-issuance-create-button"}
      >
        {isEdit ? (
          <Pencil className="size-3.5" />
        ) : (
          <>
            <Plus className="size-3.5" />
            Log issuance
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit asset issuance" : "Log asset issuance"}</DialogTitle>
          <DialogDescription>{isEdit ? "Updates details of this asset issuance." : "Records equipment or property issued to this employee."}</DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
          <RequiredFieldsHint />
          <FormField label="Asset name" htmlFor={`${formId}-name`} required>
            <Input id={`${formId}-name`} value={assetName} onChange={(event) => setAssetName(event.target.value)} placeholder="e.g. Dell Latitude 5420" required />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Asset type" htmlFor={`${formId}-type`}>
              <Input id={`${formId}-type`} value={assetType} onChange={(event) => setAssetType(event.target.value)} placeholder="e.g. Laptop" />
            </FormField>
            <FormField label="Serial number" htmlFor={`${formId}-serial`}>
              <Input id={`${formId}-serial`} value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} placeholder="e.g. SN-2024-00123" />
            </FormField>
          </div>
          <OptionSelect label="Condition" value={condition} onChange={setCondition} options={CONDITION_OPTIONS} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Issued date" htmlFor={`${formId}-issued`} required>
              <Input id={`${formId}-issued`} type="date" value={issuedDate} onChange={(event) => setIssuedDate(event.target.value)} required />
            </FormField>
            <FormField label="Returned date" htmlFor={`${formId}-returned`}>
              <Input id={`${formId}-returned`} type="date" value={returnedDate} onChange={(event) => setReturnedDate(event.target.value)} min={issuedDate || undefined} />
            </FormField>
          </div>
          <FormField label="Remarks" htmlFor={`${formId}-remarks`}>
            <Textarea id={`${formId}-remarks`} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="e.g. Minor scratch on the lid cover" />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={isSubmitting} data-testid={isEdit ? "asset-issuance-save-button" : "asset-issuance-create-submit-button"}>
            {isEdit ? (
              isSubmitting ? "Saving…" : "Save changes"
            ) : (
              <>
                <Package className="size-3.5" />
                {isSubmitting ? "Logging…" : "Log issuance"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
