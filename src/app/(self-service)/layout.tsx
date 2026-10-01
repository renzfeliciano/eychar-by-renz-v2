import { getSelfServiceSession } from "@/app/_shared/get-self-service-session";
import { ConcurrentSessionGuard } from "@/components/shared/concurrent-session-guard";
import { IdleSessionGuard } from "@/components/shared/idle-session-guard";
import { SecuritySettingsService } from "@/domains/identity/security-settings-service";
import { SelfServiceHeader } from "@/components/shared/self-service-header";

export default async function SelfServiceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSelfServiceSession();
  const security = await SecuritySettingsService.forUser(session.userId);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SelfServiceHeader name={session.name} />
      <ConcurrentSessionGuard />
      <IdleSessionGuard idleMs={security.idleTimeoutSeconds * 1000} warningMs={security.idleWarningSeconds * 1000} />
      <main className="flex flex-1 items-start justify-center p-4 md:p-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
