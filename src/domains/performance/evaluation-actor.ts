import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, UserModel } from "@/server/db/models";
import { authorize } from "@/server/authorization/authorize";
import { AuthorizationError } from "@/shared/errors";

export const EVALUATION_MANAGE_PERMISSION = "performance-evaluations.manage";

/**
 * Who is acting on an evaluation: their own employee record (a staff account
 * is linked to one through its person, a self-service account directly), and
 * whether they hold the HR / Operations oversight permission. The evaluator of
 * record is data on the evaluation, never a role-name check (ENGINEERING.md §20).
 */
export type EvaluationActor = { userId: string; employeeId: string | null; canManage: boolean };

export async function resolveEvaluationActor(userId: string, organizationId: string): Promise<EvaluationActor> {
  await connectMongoDB();
  const user = await UserModel.findById(userId).lean();

  let employeeId: string | null = user?.employeeId ? user.employeeId.toString() : null;
  if (!employeeId && user?.personId) {
    const employee = await EmployeeModel.findOne({ organizationId: new Types.ObjectId(organizationId), personId: user.personId }).select("_id").lean();
    employeeId = employee ? employee._id.toString() : null;
  }

  let canManage = false;
  try {
    await authorize({ userId, organizationId, permission: EVALUATION_MANAGE_PERMISSION });
    canManage = true;
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
  }
  return { userId, employeeId, canManage };
}
