/** "Front Desk Staff" -> "FRONT-DESK-STAFF" (Position/Project code convention). */
export function slugifyUpperKebab(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "On Leave" -> "on_leave" (catalog code convention: EmploymentType, EmploymentStatus, etc.). */
export function slugifyLowerSnake(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
