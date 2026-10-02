"use client";

import { useId } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "./form-field";

export type SelectOption = { id: string; label: string };

const NONE = "__none__";

/**
 * Every hire/transfer/create form needs an optional FK dropdown (position,
 * organization unit, project, location, manager) with a "None" choice —
 * Base UI's Select (like Radix's) doesn't allow an empty-string item
 * value, so this centralizes the sentinel-value workaround once instead of
 * repeating it in every form.
 */
export function OptionSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "None",
  testId,
  required,
  id,
  error,
  description,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  testId?: string;
  required?: boolean;
  /** The trigger's id (the label points at it); generated when omitted. */
  id?: string;
  error?: string | null;
  description?: string;
}) {
  const generatedId = useId();
  const triggerId = id ?? `option-select${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const selectedLabel = value ? options.find((option) => option.id === value)?.label ?? placeholder : placeholder;

  return (
    <FormField label={label} htmlFor={triggerId} required={required} error={error} description={description}>
      <Select value={value || NONE} onValueChange={(next) => onChange(!next || next === NONE ? "" : next)}>
        <SelectTrigger id={triggerId} className="w-full" data-testid={testId}>
          {/* Computed from our own state rather than SelectValue's default
              label lookup, which only resolves once the popup's items have
              registered — before that it renders the raw sentinel value. */}
          <SelectValue>{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}
