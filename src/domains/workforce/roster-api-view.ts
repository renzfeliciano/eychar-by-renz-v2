/**
 * What `GET /api/employees` may hand out. The roster loader carries statutory
 * IDs (SSS, PhilHealth, Pag-IBIG, TIN), birth date, address, phone and HR
 * remarks because the audited export needs them. A plain list call doesn't, and
 * `employees.read` is held by far more people than the export permission, so
 * those fields are dropped here, by naming what stays rather than what goes:
 * a field added to the loader later stays private until someone adds it here.
 */
type RosterPerson = { firstName?: string; middleName?: string; lastName?: string; email?: string } | null;

export function toRosterApiRow<T extends { person: RosterPerson | (Record<string, unknown> & RosterPerson) }>(row: T): Omit<T, "person"> & { person: RosterPerson } {
  const { person, ...rest } = row;
  return {
    ...rest,
    person: person ? { firstName: person.firstName, middleName: person.middleName, lastName: person.lastName, email: person.email } : null,
  };
}
