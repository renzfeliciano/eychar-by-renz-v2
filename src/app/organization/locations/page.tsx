import { getCurrentOrganization } from "../../_shared/get-current-organization";
import { hasPermission } from "../../_shared/has-permission";
import { LocationService } from "@/domains/organization/location-service";
import { CreateLocationForm } from "./create-location-form";

export default async function LocationsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("locations.read", organizationId))) {
    return <p className="text-sm">You don&apos;t have access to view locations.</p>;
  }

  const locations = await LocationService.listCurrent(organizationId);

  return (
    <section>
      <CreateLocationForm organizationId={organizationId} />

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="text-left" style={{ color: "var(--muted)" }}>
            <th className="pb-2">Name</th>
            <th className="pb-2">Code</th>
            <th className="pb-2">Address</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((location) => (
            <tr key={location._id.toString()} className="border-t" style={{ borderColor: "var(--line)" }}>
              <td className="py-2">{location.name}</td>
              <td className="py-2">{location.code}</td>
              <td className="py-2">{location.address ?? "—"}</td>
              <td className="py-2">{location.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {locations.length === 0 && <p className="mt-4 text-sm">No locations yet.</p>}
    </section>
  );
}
