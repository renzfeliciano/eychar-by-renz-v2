import type { Metadata } from "next";
import { getSelfServiceSession } from "@/app/_shared/get-self-service-session";
import { ConcurrentSessionGuard } from "@/components/shared/concurrent-session-guard";
import { IdleSessionGuard } from "@/components/shared/idle-session-guard";
import { SecuritySettingsService } from "@/domains/identity/security-settings-service";
import { SelfServiceHeader } from "@/components/shared/self-service-header";

// Everything here is behind sign-in and holds personal data: never list it in search.
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } } };

export default async function SelfServiceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSelfServiceSession();
  const security = await SecuritySettingsService.forUser(session.userId);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SelfServiceHeader name={session.name} />
      <ConcurrentSessionGuard />
      <IdleSessionGuard idleMs={security.idleTimeoutSeconds * 1000} warningMs={security.idleWarningSeconds * 1000} />
      <main className="flex flex-1 items-start justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-8 md:pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
