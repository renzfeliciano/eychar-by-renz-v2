/** Full years between a date and now (or `asOf`), the usual "count your birthdays" rule. */
export function calculateAge(birthDate: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    asOf.getMonth() > birthDate.getMonth() ||
    (asOf.getMonth() === birthDate.getMonth() && asOf.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/** "3 yrs 2 mos" style summary of tenure since `dateHired`. */
export function formatLengthOfService(dateHired: Date, asOf: Date = new Date()): string {
  let years = asOf.getFullYear() - dateHired.getFullYear();
  let months = asOf.getMonth() - dateHired.getMonth();
  if (asOf.getDate() < dateHired.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0 && months <= 0) return "Less than a month";
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} mo${months === 1 ? "" : "s"}`);
  return parts.join(" ");
}
