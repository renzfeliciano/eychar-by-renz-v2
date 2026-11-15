export type CatalogChoiceItem = { code: string; name: string; status?: string; sortOrder?: number };
export type CatalogChoiceOption = { id: string; label: string };

/**
 * The choices for a dropdown fed by a simple catalog (e.g. Civil statuses):
 * the active items in catalog order. The person's current value is always
 * included, even after HR retires it (marked "(retired)") or if it has no
 * catalog item, so opening their form never silently blanks it. A retired
 * item can't be newly chosen for anyone else. Pure, so any form can use it.
 */
export function catalogChoiceOptions(items: CatalogChoiceItem[], currentCode?: string | null): CatalogChoiceOption[] {
  const options = items.filter((item) => item.status !== "inactive").map((item) => ({ id: item.code, label: item.name }));
  if (currentCode && !options.some((option) => option.id === currentCode)) {
    const retired = items.find((item) => item.code === currentCode);
    options.push({ id: currentCode, label: retired ? `${retired.name} (retired)` : currentCode });
  }
  return options;
}

/** What to show for a stored code: the catalog name (active or retired), the code as stored if there is no such item, or nothing. */
export function catalogChoiceName(items: CatalogChoiceItem[], code?: string | null): string {
  if (!code) return "";
  return items.find((item) => item.code === code)?.name ?? code;
}
