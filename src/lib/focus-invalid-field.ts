/**
 * Scrolls the field a server validation error is about into view and gives
 * it a brief highlight ring — the error card alone tells you *what's*
 * wrong, this connects it to *where*. Every dialog's inputs end their id
 * in `-${schemaFieldName}` (whatever prefix precedes it), so this matches
 * by suffix within the given form rather than requiring one fixed prefix
 * convention across every dialog.
 */
export function focusInvalidField(formId: string, field: string | null | undefined) {
  if (!field) return;
  const form = document.getElementById(formId);
  const element = form?.querySelector<HTMLElement>(`[id$="-${field}"]`) ?? document.querySelector<HTMLElement>(`[id$="-${field}"]`);
  if (!element) return;

  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.classList.add("field-error-highlight");
  window.setTimeout(() => element.classList.remove("field-error-highlight"), 1600);

  if (typeof element.focus === "function") {
    window.setTimeout(() => element.focus({ preventScroll: true }), 300);
  }
}
