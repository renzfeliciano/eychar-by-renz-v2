"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Upload, Save } from "lucide-react";
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
import { ALLOWED_DOCUMENT_LABELS, DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_LABEL, guessDocumentType } from "@/domains/documents/file-check";


export type DocumentFormValue = {
  id: string;
  title: string;
  documentType: string;
  fileName: string;
  expiresAt?: string | null;
  notes?: string | null;
};

function toDateInputValue(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export function DocumentFormDialog({
  organizationId,
  employeeId,
  documentTypes,
  initialValue,
}: {
  organizationId: string;
  employeeId: string;
  documentTypes: SelectOption[];
  initialValue?: DocumentFormValue;
}) {
  const isEdit = Boolean(initialValue);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialValue?.title ?? "");
  const [documentType, setDocumentType] = useState(initialValue?.documentType ?? "");
  const [expiresAt, setExpiresAt] = useState(toDateInputValue(initialValue?.expiresAt));
  const [notes, setNotes] = useState(initialValue?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!documentType) {
      setError("Select a document type.");
      return;
    }

    const metadata = { organizationId, title, documentType, expiresAt: expiresAt || undefined, notes: notes || undefined };
    let request: RequestInit;
    if (isEdit) {
      request = { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metadata) };
    } else {
      const file = fileInputRef.current?.files?.[0];
      if (!file) {
        setError("Choose a file to upload.");
        return;
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        setError(`File is too large (max ${MAX_DOCUMENT_LABEL}).`);
        return;
      }
      // Sent as the file itself (multipart), not base64 in JSON, so it fits the hosting body limit.
      const form = new FormData();
      for (const [key, value] of Object.entries(metadata)) if (value) form.set(key, value);
      form.set("file", file.type ? file : new File([file], file.name, { type: guessDocumentType(file.name) }));
      request = { method: "POST", body: form };
    }

    setIsSubmitting(true);
    const response = await fetch(isEdit ? `/api/employees/${employeeId}/documents/${initialValue!.id}` : `/api/employees/${employeeId}/documents`, request).catch(() => null);
    if (!response) {
      setIsSubmitting(false);
      setError("Couldn't reach the server. Check your connection and try again.");
      return;
    }
    setIsSubmitting(false);

    if (!response.ok) {
      const responseBody = await response.json().catch(() => ({}));
      setError(responseBody.error ?? `Failed to ${isEdit ? "save" : "upload"} document.`);
      return;
    }

    if (!isEdit) {
      setTitle("");
      setDocumentType("");
      setExpiresAt("");
      setNotes("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    setOpen(false);
    toast.success(isEdit ? "Document updated" : "Document uploaded", { description: title });
    router.refresh();
  }

  const formId = `document-form-${initialValue?.id ?? "new"}`;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setTitle(initialValue?.title ?? "");
      setDocumentType(initialValue?.documentType ?? "");
      setExpiresAt(toDateInputValue(initialValue?.expiresAt));
      setNotes(initialValue?.notes ?? "");
      setError(null);
      if (!isEdit && fileInputRef.current) fileInputRef.current.value = "";
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(isEdit ? buttonVariants({ size: "sm", variant: "ghost" }) : buttonVariants({ size: "sm" }))}
        aria-label={isEdit ? "Edit document" : undefined}
        data-testid={isEdit ? "document-edit-button" : "documents-upload-button"}
      >
        {isEdit ? (
          <Pencil className="size-3.5" />
        ) : (
          <>
            <Plus className="size-3.5" />
            Upload document
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit document" : "Upload document"}</DialogTitle>
          <DialogDescription>{isEdit ? "Updates details of this document record." : "Attaches a document to this employee's file."}</DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Title" htmlFor={`${formId}-title`} required>
            <Input id={`${formId}-title`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Government ID" required />
          </FormField>
          <OptionSelect label="Document type" value={documentType} onChange={setDocumentType} options={documentTypes} placeholder="Select a type" required />
          {isEdit ? (
            <FormField label="File" htmlFor={`${formId}-file`}>
              <p className="text-sm text-muted-foreground">{initialValue!.fileName} (upload a new document to replace this file)</p>
            </FormField>
          ) : (
            <FormField label="File" htmlFor={`${formId}-file`} required>
              <Input id={`${formId}-file`} ref={fileInputRef} type="file" accept={DOCUMENT_ACCEPT} required aria-describedby={`${formId}-file-hint`} />
              <p id={`${formId}-file-hint`} className="text-xs text-muted-foreground">
                {ALLOWED_DOCUMENT_LABELS}, up to {MAX_DOCUMENT_LABEL}.
              </p>
            </FormField>
          )}
          <FormField label="Expires on" htmlFor={`${formId}-expires`}>
            <Input id={`${formId}-expires`} type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </FormField>
          <FormField label="Notes" htmlFor={`${formId}-notes`}>
            <Textarea id={`${formId}-notes`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Renewed copy, valid until 2028" />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} icon={isEdit ? Save : Upload} pending={isSubmitting} pendingLabel={isEdit ? "Saving…" : "Uploading…"} data-testid={isEdit ? "document-save-button" : "documents-upload-submit-button"}>
            {isEdit ? "Save changes" : "Upload document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
