import type { Metadata } from "next";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { isSuperAdmin } from "@/app/_shared/is-super-admin";
import { SecuritySettingsService } from "@/domains/identity/security-settings-service";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SecuritySettingsForm } from "./security-settings-form";

export const metadata: Metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;
  const organizationId = organization._id.toString();
  if (!(await isSuperAdmin(organizationId))) return <p className="text-sm text-muted-foreground">Only the Super Administrator can change security settings.</p>;

  const settings = await SecuritySettingsService.get(organizationId);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Security settings" description="How long a session may sit idle before it's signed out, for everyone in the organization." />
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
    </div>
  );
}
