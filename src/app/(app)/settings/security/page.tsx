import type { Metadata } from "next";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { isSuperAdmin } from "@/app/_shared/is-super-admin";
import { SecuritySettingsService } from "@/domains/identity/security-settings-service";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SecuritySettingsForm } from "./security-settings-form";
import { TwoStepRequirementForm } from "./two-step-requirement-form";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;
  const organizationId = organization._id.toString();
  if (!(await isSuperAdmin(organizationId))) return <NoAccessState superAdminOnly message="Only the Super Administrator can change security settings." />;

  const [settings, staffWithoutTwoStep] = await Promise.all([SecuritySettingsService.get(organizationId), SecuritySettingsService.staffWithoutTwoStep(organizationId)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Security settings" description="Idle sign-out and two-step verification rules for everyone in the organization." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Idle sign-out</CardTitle>
          <CardDescription>
            Currently {settings.idleTimeoutSeconds} seconds, with a warning {settings.idleWarningSeconds} seconds before.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecuritySettingsForm organizationId={organizationId} idleTimeoutSeconds={settings.idleTimeoutSeconds} idleWarningSeconds={settings.idleWarningSeconds} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Two-step verification</CardTitle>
          <CardDescription>
            {settings.requireTwoStepForStaff ? "Required for HR and admin accounts." : "Optional."}{" "}
            {staffWithoutTwoStep === 0 ? "Every HR and admin account has it on." : `${staffWithoutTwoStep} HR or admin account${staffWithoutTwoStep === 1 ? " doesn't" : "s don't"} have it on yet.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TwoStepRequirementForm
            organizationId={organizationId}
            required={settings.requireTwoStepForStaff}
            idleTimeoutSeconds={settings.idleTimeoutSeconds}
            idleWarningSeconds={settings.idleWarningSeconds}
          />
        </CardContent>
      </Card>
    </div>
  );
}
