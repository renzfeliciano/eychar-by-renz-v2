"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Save } from "lucide-react";
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
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import { useFieldErrors } from "@/lib/field-errors";

export type LeaveTypeFormValue = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
};

export function LeaveTypeFormDialog({
  organizationId,
  initialValue,
}: {
  organizationId: string;
  initialValue?: LeaveTypeFormValue;
}) {
  const router = useRouter();
  const isEdit = Boolean(initialValue);
  const formId = `leave-type-form-${initialValue?.id ?? "new"}`;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialValue?.name ?? "");
  const [code, setCode] = useState(initialValue?.code ?? "");
  const [description, setDescription] = useState(initialValue?.description ?? "");
  const { fieldErrors, formError: error, setFormError: setError, setFromResponse, clearField } = useFieldErrors({ formId, fields: ["name", "code", "description"] });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(isEdit ? `/api/leave-types/${initialValue!.id}` : "/api/leave-types", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, code, description: description || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setFromResponse(body, `Failed to ${isEdit ? "save" : "create"} leave type.`);
      return;
    }

    if (!isEdit) {
      setName("");
      setCode("");
      setDescription("");
    }
    setOpen(false);
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setName(initialValue?.name ?? "");
      setCode(initialValue?.code ?? "");
      setDescription(initialValue?.description ?? "");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(isEdit ? buttonVariants({ variant: "ghost", size: "icon-sm" }) : buttonVariants({ size: "sm" }))}
        data-testid={isEdit ? `leave-types-edit-button-${initialValue!.id}` : "leave-types-create-button"}
        aria-label={isEdit ? `Edit ${initialValue!.name}` : undefined}
      >
        {isEdit ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
        {!isEdit && "Add leave type"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit leave type" : "Add leave type"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Renames or redescribes this leave type — the code is used elsewhere, so changing it updates every reference." : "Adds a new kind of leave employees can request, like Vacation or Sick."}
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Name" htmlFor={`${formId}-name`} error={fieldErrors.name} required>
            <Input
              id={`${formId}-name`}
              placeholder="e.g. Vacation Leave"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                clearField("name");
              }}
              required
            />
          </FormField>
          <FormField label="Code" htmlFor={`${formId}-code`} error={fieldErrors.code} required>
            <Input
              id={`${formId}-code`}
              placeholder="e.g. VL"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                clearField("code");
              }}
              required
            />
          </FormField>
          <FormField label="Description" htmlFor={`${formId}-description`} error={fieldErrors.description}>
            <Input
              id={`${formId}-description`}
              placeholder="e.g. Paid time off for rest and personal matters"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                clearField("description");
              }}
            />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} data-testid="leave-types-form-submit-button" icon={Save} pending={isSubmitting} pendingLabel={isEdit ? "Saving…" : "Adding…"}>
            {isEdit ? "Save changes" : "Add leave type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
