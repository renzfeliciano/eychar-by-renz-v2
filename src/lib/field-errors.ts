"use client";

import { useState } from "react";
import { focusInvalidField } from "@/lib/focus-invalid-field";

/** Scrolls to and focuses one control, with the same brief highlight focusInvalidField uses. */
function focusControl(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView?.({ behavior: "smooth", block: "center" });
  element.classList.add("field-error-highlight");
  window.setTimeout(() => element.classList.remove("field-error-highlight"), 1600);
  window.setTimeout(() => element.focus({ preventScroll: true }), 300);
}

/** A validation error body from the API (src/shared/errors/to-response.ts): `{ error, field }`. */
export type ApiErrorBody = { error?: unknown; field?: unknown };

/**
 * Splits an API error body into a field-level error (shown under that
 * field's FormField) or a form-level one (shown in FormError). A `field` is
 * only routed to a field when the form actually renders it (`fields`), so an
 * error about something the form doesn't show still reaches the person.
 */
export function splitApiError(
  body: unknown,
  fallback: string,
  fields?: readonly string[],
): { field: string | null; message: string; fieldErrors: Record<string, string>; formError: string | null } {
  const { error, field } = (body && typeof body === "object" ? body : {}) as ApiErrorBody;
  const message = typeof error === "string" && error.trim() ? error : fallback;
  const key = typeof field === "string" && field && (!fields || fields.includes(field)) ? field : null;
  return key ? { field: key, message, fieldErrors: { [key]: message }, formError: null } : { field: null, message, fieldErrors: {}, formError: message };
}

/**
 * Per-form error state: `fieldErrors.firstName` for <FormField error=…>,
 * `formError` for <FormError>. `fieldIds` maps each API field key the form
 * renders to its control's id (`{ firstName: "hire-first-name" }`) — those are
 * the fields an error can land on. `setFromResponse` takes the parsed body
 * of a failed request and focuses the field it's about (so its
 * aria-describedby error is read out); `setFieldError` does the same for a
 * client-side check. A form whose control ids already end in `-<field>`
 * (`${formId}-firstName`) passes `formId` and `fields` instead, and focus
 * uses focusInvalidField's suffix match.
 */
export function useFieldErrors({
  fieldIds,
  formId,
  fields: fieldList,
}: { fieldIds?: Readonly<Record<string, string>>; formId?: string; fields?: readonly string[] } = {}) {
  const fields = fieldList ?? (fieldIds ? Object.keys(fieldIds) : undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormErrorState] = useState<string | null>(null);

  /** A form-level message (or null to clear) — it replaces any field errors, so only one error shows at a time. */
  function setFormError(message: string | null) {
    setFieldErrors({});
    setFormErrorState(message);
  }

  function clear() {
    setFormError(null);
  }

  function setFromResponse(body: unknown, fallback: string) {
    const result = splitApiError(body, fallback, fields);
    setFieldErrors(result.fieldErrors);
    setFormErrorState(result.formError);
    if (result.field) focus(result.field);
    return result;
  }

  function focus(field: string) {
    if (fieldIds?.[field]) focusControl(fieldIds[field]);
    else if (formId) focusInvalidField(formId, field);
  }

  /** A client-side check failed on one field: show it there and move focus to it. */
  function setFieldError(field: string, message: string) {
    setFieldErrors({ [field]: message });
    setFormErrorState(null);
    focus(field);
  }

  /** The person edited this field: its error no longer applies. */
  function clearField(field: string) {
    setFieldErrors((previous) => {
      if (!(field in previous)) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  return { fieldErrors, formError, setFormError, setFieldError, setFromResponse, clearField, clear };
}
