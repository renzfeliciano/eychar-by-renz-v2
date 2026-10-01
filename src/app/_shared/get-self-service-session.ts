import { redirect } from "next/navigation";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, PersonModel, UserModel } from "@/server/db/models";
import { formatPersonName } from "@/lib/person-name";
import { getSession } from "@/server/auth/session";

/**
 * Resolves the logged-in session to its own linked Employee record — never
 * a client-supplied id. Redirects to /login if there's no session, and
 * to /dashboard if the session belongs to an HR/admin account (no
 * employeeId) rather than a self-service one.
 */
export async function getSelfServiceSession() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  await connectMongoDB();
  const user = await UserModel.findById(session.user.id).lean();
  if (!user?.employeeId) redirect("/dashboard");
  // A temporary password (new account or an HR reset) must be replaced first.
  if (user.mustChangePassword) redirect("/change-password");

  const employee = await EmployeeModel.findById(user.employeeId).lean();
  if (!employee) redirect("/login");

  const person = await PersonModel.findById(employee.personId).lean();

  return {
    userId: session.user.id,
    organizationId: employee.organizationId.toString(),
    employeeId: employee._id.toString(),
    employeeNumber: employee.employeeNumber,
    name: person ? formatPersonName(person) : "Employee",
  };
}
