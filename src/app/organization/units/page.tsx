import { getCurrentOrganization } from "../../_shared/get-current-organization";
import { hasPermission } from "../../_shared/has-permission";
import { OrganizationUnitService } from "@/domains/organization/organization-unit-service";
import { CreateUnitForm } from "./create-unit-form";

export default async function OrganizationUnitsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("organization-units.read", organizationId))) {
    return <p className="text-sm">You don&apos;t have access to view organization units.</p>;
  }

  const units = await OrganizationUnitService.listCurrent(organizationId);

  return (
    <section>
      <CreateUnitForm
        organizationId={organizationId}
        units={units.map((unit) => ({ id: unit._id.toString(), name: unit.name }))}
      />

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="text-left" style={{ color: "var(--muted)" }}>
            <th className="pb-2">Name</th>
            <th className="pb-2">Code</th>
            <th className="pb-2">Type</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <tr key={unit._id.toString()} className="border-t" style={{ borderColor: "var(--line)" }}>
              <td className="py-2">{unit.name}</td>
              <td className="py-2">{unit.code}</td>
              <td className="py-2">{unit.type}</td>
              <td className="py-2">{unit.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {units.length === 0 && <p className="mt-4 text-sm">No organization units yet.</p>}
    </section>
  );
}
