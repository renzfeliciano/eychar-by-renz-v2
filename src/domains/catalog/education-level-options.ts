export type EducationLevelItem = { code: string; name: string; status?: string; sortOrder?: number };
export type EducationLevelOption = { id: string; label: string };

/**
 * The choices for a "Highest educational attainment" dropdown: the active
 * levels in catalog order. A person's current level is always included, even
 * after HR retires it (marked "(retired)") or if it has no catalog item, so
 * opening their form never silently blanks a value they already have. A
 * retired level can't be newly chosen for anyone else: it only appears for
 * the person who holds it. Pure, so forms on any page can use it.
 */
export function educationLevelOptions(levels: EducationLevelItem[], currentCode?: string | null): EducationLevelOption[] {
  const options = levels.filter((level) => level.status !== "inactive").map((level) => ({ id: level.code, label: level.name }));
  if (currentCode && !options.some((option) => option.id === currentCode)) {
    const retired = levels.find((level) => level.code === currentCode);
    options.push({ id: currentCode, label: retired ? `${retired.name} (retired)` : currentCode });
  }
  return options;
}

/**
 * What to show for a person's level: the catalog name (active or retired), the code as entered
 * if the catalog has no such item, or nothing when there is no level. The roster and the profile both use this.
 */
export function educationLevelName(levels: EducationLevelItem[], code?: string | null): string {
  if (!code) return "";
  return levels.find((level) => level.code === code)?.name ?? code;
}
