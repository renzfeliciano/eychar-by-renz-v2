export function formatPersonName(person: { firstName: string; middleName?: string | null; lastName: string } | null | undefined): string {
  if (!person) return "—";
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
}
