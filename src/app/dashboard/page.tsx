import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { OrganizationService } from "@/domains/organization/organization-service";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const organizations = await OrganizationService.listAccessibleTo(session.user.id);

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Signed in as {session.user.name ?? session.user.email}
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-medium" style={{ color: "var(--muted)" }}>
          Your organizations
        </h2>
        {organizations.length === 0 ? (
          <p className="mt-2 text-sm">No organization access yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {organizations.map((organization) => (
              <li key={organization._id.toString()}>{organization.name}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
