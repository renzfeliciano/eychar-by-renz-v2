"use client";

import { useId, useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormError, FormField } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";
import { sectionFields, type SectionField } from "@/domains/complaints/stage-sections";

/** One stage's details as the form holds them: every value a string, dates as `YYYY-MM-DD`. */
export type SectionValues = Record<string, string>;

const toInput = (field: SectionField, value: string | undefined) => (field.kind === "date" ? (value ?? "").slice(0, 10) : (value ?? ""));

/** Only the fields that have a value, so saving the form replaces the section and a blanked field is cleared. */
function filled(fields: SectionField[], values: SectionValues): SectionValues {
  return Object.fromEntries(fields.flatMap((field) => (values[field.key]?.trim() ? [[field.key, values[field.key].trim()]] : [])));
}

/**
 * A stage's details form in a dialog, driven by the stage's field set. Used to
 * record details while moving a card (with a "move without details" way out) and to
 * edit them later from the side panel. `onSave` and `onSkip` return an error message
 * to show in the form, or null when it worked (the dialog then closes).
 */
export function StageDetailsDialog({
  open,
  onOpenChange,
  stageCode,
  title,
  description,
  initial,
  saveLabel,
  savePendingLabel,
  skip,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageCode: string;
  title: string;
  description: string;
  initial?: SectionValues;
  saveLabel: string;
  savePendingLabel: string;
  skip?: { label: string; pendingLabel: string; onSkip: () => Promise<string | null> };
  onSave: (values: SectionValues) => Promise<string | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        {open && (
          <DetailsForm
            stageCode={stageCode}
            title={title}
            description={description}
            initial={initial}
            saveLabel={saveLabel}
            savePendingLabel={savePendingLabel}
            skip={skip}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Its own component so the form's state starts fresh each time the dialog opens.
function DetailsForm({
  stageCode,
  title,
  description,
  initial,
  saveLabel,
  savePendingLabel,
  skip,
  onSave,
  onClose,
}: {
  stageCode: string;
  title: string;
  description: string;
  initial?: SectionValues;
  saveLabel: string;
  savePendingLabel: string;
  skip?: { label: string; pendingLabel: string; onSkip: () => Promise<string | null> };
  onSave: (values: SectionValues) => Promise<string | null>;
  onClose: () => void;
}) {
  const fields = sectionFields(stageCode);
  const formId = `stage-details-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [values, setValues] = useState<SectionValues>(() => Object.fromEntries(fields.map((field) => [field.key, toInput(field, initial?.[field.key])])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "skip" | null>(null);

  async function run(action: "save" | "skip", work: () => Promise<string | null>) {
    setError(null);
    setBusy(action);
    let message: string | null;
    try {
      message = await work();
    } catch {
      message = "Couldn't reach the server. Check your connection and try again.";
    }
    setBusy(null);
    if (message) setError(message);
    else onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("save", () => onSave(filled(fields, values)));
  }

  const set = (key: string, value: string) => setValues((state) => ({ ...state, [key]: value }));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {fields.map((field) => {
          const id = `${formId}-${field.key}`;
          if (field.kind === "choice") {
            return (
              <OptionSelect
                key={field.key}
                id={id}
                label={field.label}
                value={values[field.key] ?? ""}
                onChange={(next) => set(field.key, next)}
                options={(field.options ?? []).map((option) => ({ id: option.value, label: option.label }))}
                placeholder="Not set"
              />
            );
          }
          return (
            <FormField key={field.key} label={field.label} htmlFor={id}>
              {field.kind === "date" ? (
                <Input id={id} type="date" value={values[field.key] ?? ""} onChange={(event) => set(field.key, event.target.value)} />
              ) : field.kind === "text" ? (
                <Input id={id} value={values[field.key] ?? ""} onChange={(event) => set(field.key, event.target.value)} maxLength={field.maxLength} />
              ) : (
                <Textarea id={id} value={values[field.key] ?? ""} onChange={(event) => set(field.key, event.target.value)} maxLength={field.maxLength} />
              )}
            </FormField>
          );
        })}
        <FormError message={error} />
      </form>
      <DialogFooter>
        {skip && (
          <Button
            type="button"
            variant="outline"
            icon={ArrowRight}
            pending={busy === "skip"}
            pendingLabel={skip.pendingLabel}
            disabled={busy === "save"}
            onClick={() => void run("skip", skip.onSkip)}
            data-testid="complaint-stage-form-skip"
          >
            {skip.label}
          </Button>
        )}
        <Button type="submit" form={formId} icon={Check} pending={busy === "save"} pendingLabel={savePendingLabel} disabled={busy === "skip"} data-testid="complaint-stage-form-save">
          {saveLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
