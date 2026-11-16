import type { SelectOption } from "./option-select";

/**
 * The search both searchable pickers share (SearchableOptionSelect and SearchableMultiSelect), so they narrow
 * a list the same way: every word typed must appear somewhere in the label, in any order
 * ("cruz juan" finds "Juan Dela Cruz"). A blank query keeps everything.
 */
export function matchOptions(options: SelectOption[], query: string): SelectOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  const words = needle.split(/\s+/);
  return options.filter((option) => words.every((word) => option.label.toLowerCase().includes(word)));
}
