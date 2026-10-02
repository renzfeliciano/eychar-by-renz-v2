import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, History, KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel } from "@/server/db/models";
import { AuditQueryService } from "@/server/audit/audit-query-service";
import { SECURITY_EVENT_LABELS, WARNING_SECURITY_EVENTS } from "@/domains/identity/security-event-labels";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeDays } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { PasswordSection } from "./password-section";
import { MfaPanel } from "./mfa-panel";
import { getSession } from "@/server/auth/session";
import { formatDateTime } from "@/lib/app-time";

export const metadata: Metadata = { title: "Security & sign-in" };


/** The signed-in person's own account security: password, two-step verification, and recent activity. */
export default async function AccountSecurityPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  await connectMongoDB();
  const user = await UserModel.findById(session.user.id).select("username email passwordChangedAt createdAt lastSignInAt lastSignInIp mfa").lean();
  if (!user) redirect("/login");
  const events = await AuditQueryService.recentSecurityEvents(session.user.id, 12);

  const now = new Date();
  const passwordSetAt = user.passwordChangedAt ?? user.createdAt;
  const mfaOn = Boolean(user.mfa?.enabled);
  const recoveryLeft = user.mfa?.recoveryCodeHashes?.length ?? 0;
  const recentFailures = events.filter((event) => event.action === "auth.sign-in-failed" && now.getTime() - new Date(event.timestamp).getTime() < 7 * 86_400_000).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Security" description={`Sign-in settings for ${user.username ?? user.email ?? "your account"}.`} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Two-step verification"
          value={mfaOn ? "On" : "Off"}
          hint={mfaOn ? `${recoveryLeft} recovery codes left` : "Recommended for every HR account"}
          icon={ShieldCheck}
          tone={mfaOn ? "success" : "warning"}
        />
        <MetricCard label="Password" value={passwordSetAt ? formatRelativeDays(passwordSetAt, now) : "—"} hint="Last changed" icon={KeyRound} />
        <MetricCard
          label="Last sign-in"
          value={user.lastSignInAt ? formatRelativeDays(user.lastSignInAt, now) : "—"}
          hint={recentFailures ? `${recentFailures} failed attempt${recentFailures === 1 ? "" : "s"} this week` : user.lastSignInIp ? `From ${user.lastSignInIp}` : "No sign-ins recorded yet"}
          icon={LogIn}
          tone={recentFailures ? "danger" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Two-step verification</CardTitle>
              <CardDescription>A code from your phone at every sign-in, on top of your password.</CardDescription>
            </CardHeader>
            <CardContent>
              <MfaPanel enabled={mfaOn} enabledAt={user.mfa?.enabledAt ? new Date(user.mfa.enabledAt).toISOString() : null} recoveryCodesLeft={recoveryLeft} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Password</CardTitle>
              <CardDescription>Use at least 12 characters. A few unrelated words with a number works well.</CardDescription>
            </CardHeader>
            <CardContent>
              <PasswordSection />
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-muted-foreground" aria-hidden="true" />
              Recent activity
            </CardTitle>
            <CardDescription>Sign-ins and security changes on this account. Don&apos;t recognize one? Change your password and tell HR.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {events.length === 0 ? (
              <p className="px-(--card-spacing) text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ol className="-mt-(--card-spacing) divide-y">
                {events.map((event) => {
                  const warning = WARNING_SECURITY_EVENTS.has(event.action);
                  const ip = (event.metadata as { ip?: string } | undefined)?.ip;
                  return (
                    <li key={event._id.toString()} className="flex items-start gap-3 px-(--card-spacing) py-2.5">
                      <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", warning ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")} aria-hidden="true">
                        {warning ? <AlertTriangle className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm">{SECURITY_EVENT_LABELS[event.action] ?? event.action}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(event.timestamp)}
                          {ip && ip !== "unknown" ? ` · ${ip}` : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
