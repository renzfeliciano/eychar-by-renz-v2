import { PersonService } from "@/domains/people/person-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import type { HireEmployeeInput } from "@/shared/validation/workforce";

/**
 * Orchestrates a brand-new hire as three separately audited writes
 * (Person → Employee → Employment → EmployeeAssignment), not one Mongo
 * transaction — see ADR-005. A hire failing halfway is rare and
 * recoverable at this scale; wrapping it would be an unjustified
 * transaction (AGENTS.md §33).
 */
export const HireService = {
  async hire(input: HireEmployeeInput, actor: { userId?: string }) {
    const person = await PersonService.create(
      {
        organizationId: input.organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        gender: input.gender,
        birthDate: input.birthDate,
        address: input.address,
        sssNumber: input.sssNumber,
        philHealthNumber: input.philHealthNumber,
        pagIbigNumber: input.pagIbigNumber,
        tinNumber: input.tinNumber,
      },
      actor,
    );

    const employee = await EmployeeService.create(
      { organizationId: input.organizationId, personId: person._id.toString(), employeeNumber: input.employeeNumber },
      actor,
    );

    const employment = await EmploymentService.create(
      {
        organizationId: input.organizationId,
        employeeId: employee._id.toString(),
        employmentType: input.employmentType,
        effectiveFrom: input.effectiveFrom,
        endOfContract: input.endOfContract,
      },
      actor,
    );

    const assignment = await EmployeeAssignmentService.create(
      {
        organizationId: input.organizationId,
        employeeId: employee._id.toString(),
        positionId: input.positionId,
        organizationUnitId: input.organizationUnitId,
        projectId: input.projectId,
        locationId: input.locationId,
        reportsToEmployeeId: input.reportsToEmployeeId,
        effectiveFrom: input.effectiveFrom,
      },
      actor,
    );

    return { person, employee, employment, assignment };
  },
};
