import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, GovernmentIdRecordModel, PersonModel, ProfessionalLicenseRecordModel } from "@/server/db/models";
import { GovernmentIdTypeService } from "@/domains/catalog/government-id-type-service";
import { PrcProfessionService } from "@/domains/catalog/prc-profession-service";
import { catalogChoiceName } from "@/domains/catalog/catalog-choice-options";
import { dateToDateKey } from "@/lib/date-key";

/** An ID or license with a validity date, for one employee record: what the dashboard turns into a to-do row. */
export type ExpiringIdItem = { id: string; employeeId: string; label: string; validKey: string };

/** The most items read from each source, so a very large organization can't make the dashboard slow. */
const LIMIT = 200;

/**
 * The dashboard's "IDs and licenses to renew" source: every PWD, Solo Parent, government ID and PRC license
 * date on or before `until` (already-expired ones included), across the organization. These belong to the
 * person, so a rehired person's items come back once per employee record; the dashboard keeps the active one.
 * Read-only; no document is loaded beyond the few fields needed.
 */
export const IdExpiryService = {
  /**
   * With `options.employeeIds` (the dashboard passes current staff), only those employees' items are read, so
   * the old dates of people who have left can't use up the per-source cap and hide a current employee's, and a
   * rehired person with both records in the list gets one item, on the newest record. Without it, every
   * employee record of each person gets the item.
   */
  async listExpiring(organizationId: string, until: Date, options: { employeeIds?: string[] } = {}): Promise<ExpiringIdItem[]> {
    await connectMongoDB();
    const orgId = new Types.ObjectId(organizationId);
    const due = { $lte: until };

    // Restrict to the given employees: their persons, and one (the newest) employee record per person.
    let personScope: Types.ObjectId[] | null = null;
    let employeeOfPerson: Map<string, string> | null = null;
    if (options.employeeIds) {
      if (options.employeeIds.length === 0) return [];
      const scoped = await EmployeeModel.find({ organizationId: orgId, _id: { $in: options.employeeIds.map((id) => new Types.ObjectId(id)) } })
        .select("personId")
        .lean();
      employeeOfPerson = new Map();
      for (const employee of scoped) {
        const key = employee.personId.toString();
        const current = employeeOfPerson.get(key);
        if (!current || employee._id.toString() > current) employeeOfPerson.set(key, employee._id.toString());
      }
      personScope = scoped.map((employee) => employee.personId);
      if (personScope.length === 0) return [];
    }
    const forPeople = personScope ? { personId: { $in: personScope } } : {};

    const [people, governmentIds, licenses, idTypes, professions] = await Promise.all([
      PersonModel.find({ organizationId: orgId, ...(personScope ? { _id: { $in: personScope } } : {}), $or: [{ pwdIdValidUntil: due }, { soloParentIdValidUntil: due }] })
        .select("pwdIdValidUntil soloParentIdValidUntil")
        .sort({ _id: 1 })
        .limit(LIMIT)
        .lean(),
      GovernmentIdRecordModel.find({ organizationId: orgId, ...forPeople, validUntil: due }).select("personId typeCode otherTypeName validUntil").sort({ validUntil: -1 }).limit(LIMIT).lean(),
      ProfessionalLicenseRecordModel.find({ organizationId: orgId, ...forPeople, validUntil: due }).select("personId professionCode validUntil").sort({ validUntil: -1 }).limit(LIMIT).lean(),
      GovernmentIdTypeService.listCurrent(organizationId),
      PrcProfessionService.listCurrent(organizationId),
    ]);

    // Person-level items first, as (personId, id, label, date), then fanned out to each employee record.
    const byPerson: { personId: Types.ObjectId; id: string; label: string; validKey: string }[] = [];
    for (const person of people) {
      if (person.pwdIdValidUntil && person.pwdIdValidUntil <= until) byPerson.push({ personId: person._id, id: `pwd-${person._id}`, label: "PWD ID", validKey: dateToDateKey(person.pwdIdValidUntil) });
      if (person.soloParentIdValidUntil && person.soloParentIdValidUntil <= until) byPerson.push({ personId: person._id, id: `solo-${person._id}`, label: "Solo Parent ID", validKey: dateToDateKey(person.soloParentIdValidUntil) });
    }
    for (const record of governmentIds) {
      byPerson.push({ personId: record.personId, id: `gov-${record._id}`, label: record.otherTypeName ?? catalogChoiceName(idTypes, record.typeCode), validKey: dateToDateKey(record.validUntil) });
    }
    for (const record of licenses) {
      byPerson.push({ personId: record.personId, id: `prc-${record._id}`, label: `PRC license (${catalogChoiceName(professions, record.professionCode)})`, validKey: dateToDateKey(record.validUntil) });
    }
    if (byPerson.length === 0) return [];

    if (employeeOfPerson) {
      const chosen = employeeOfPerson;
      return byPerson.flatMap((item) => {
        const employeeId = chosen.get(item.personId.toString());
        return employeeId ? [{ id: `${item.id}-${employeeId}`, employeeId, label: item.label, validKey: item.validKey }] : [];
      });
    }

    const employees = await EmployeeModel.find({ organizationId: orgId, personId: { $in: [...new Set(byPerson.map((item) => item.personId.toString()))].map((id) => new Types.ObjectId(id)) } })
      .select("personId")
      .lean();
    const employeesOf = new Map<string, string[]>();
    for (const employee of employees) {
      const key = employee.personId.toString();
      employeesOf.set(key, [...(employeesOf.get(key) ?? []), employee._id.toString()]);
    }

    return byPerson.flatMap((item) =>
      (employeesOf.get(item.personId.toString()) ?? []).map((employeeId) => ({ id: `${item.id}-${employeeId}`, employeeId, label: item.label, validKey: item.validKey })),
    );
  },
};
