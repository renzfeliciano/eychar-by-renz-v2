import { getCurrentOrganization } from "../_shared/get-current-organization";
import { hasPermission } from "../_shared/has-permission";
import { PositionService } from "@/domains/organization/position-service";
import { OrganizationUnitService } from "@/domains/organization/organization-unit-service";
import { CreatePositionForm } from "./create-position-form";

export default async function PositionsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("positions.read", organizationId))) {
    return <p className="text-sm">You don&apos;t have access to view positions.</p>;
  }

  const [positions, units] = await Promise.all([
    PositionService.listCurrent(organizationId),
    OrganizationUnitService.listCurrent(organizationId),
  ]);
  const unitNameById = new Map(units.map((unit) => [unit._id.toString(), unit.name]));

  return (
    <section>
      <CreatePositionForm
        organizationId={organizationId}
        units={units.map((unit) => ({ id: unit._id.toString(), name: unit.name }))}
      />

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="text-left" style={{ color: "var(--muted)" }}>
            <th className="pb-2">Title</th>
            <th className="pb-2">Code</th>
            <th className="pb-2">Organization unit</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => (
            <tr key={position._id.toString()} className="border-t" style={{ borderColor: "var(--line)" }}>
              <td className="py-2">{position.title}</td>
              <td className="py-2">{position.code}</td>
              <td className="py-2">
                {position.organizationUnitId ? unitNameById.get(position.organizationUnitId.toString()) ?? "—" : "—"}
              </td>
              <td className="py-2">{position.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {positions.length === 0 && <p className="mt-4 text-sm">No positions yet.</p>}
    </section>
  );
}
