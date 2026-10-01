import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { LogOut, ShieldCheck } from "lucide-react";
import { authOptions } from "@/server/auth/options";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel } from "@/server/db/models";
import { SecuritySettingsService } from "@/domains/identity/security-settings-service";
import { Logo } from "@/components/shared/logo";
import { BrandName } from "@/components/shared/brand-name";
import { MfaPanel } from "@/app/(app)/account/security/mfa-panel";
import { SignOutLink } from "./sign-out-link";

export const metadata: Metadata = { title: "Set up two-step verification", robots: { index: false, follow: false } };

/**
 * Where a staff account lands when its organization requires two-step
 * verification (Settings › Security) and it isn't on yet. The HR workspace
 * redirects here until it is; once on, this page sends the person onward.
 */
export default async function SetUpTwoStepPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  await connectMongoDB();
  const user = await UserModel.findById(session.user.id).select("mustChangePassword employeeId username mfa.enabled").lean();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.employeeId) redirect("/clock");
  if (user.mfa?.enabled || !(await SecuritySettingsService.mustSetUpTwoStep(session.user.id))) redirect("/dashboard");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <section aria-labelledby="set-up-two-step-title" className="w-full max-w-lg overflow-hidden rounded-2xl border bg-background shadow-[var(--shadow-modal)]">
        <div className="relative border-b bg-primary/[0.035] px-6 pt-6 pb-5 sm:px-8 dark:bg-primary/[0.08]">
          <span className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden="true" />
          <div className="flex items-center gap-3">
            <Logo className="size-10 rounded-xl p-1" />
            <div className="flex flex-col leading-tight">
              <BrandName />
              <span className="text-xs text-muted-foreground">Signed in as {user.username ?? "your account"}</span>
            </div>
          </div>
          <h1 id="set-up-two-step-title" className="mt-6 text-xl font-semibold tracking-tight">
            Set up two-step verification
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your organization requires it for HR and admin accounts, because they can see pay and personal records. It takes about a minute with an authenticator app on your phone.
          </p>
        </div>
        <div className="px-6 py-6 sm:px-8">
          <MfaPanel enabled={false} enabledAt={null} recoveryCodesLeft={0} />
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t bg-primary/[0.035] px-6 py-3 text-xs text-muted-foreground sm:px-8 dark:bg-primary/[0.08]">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            A stolen password alone won&apos;t get into your account.
          </span>
          <SignOutLink>
            <LogOut className="size-3.5" aria-hidden="true" />
            Sign out
          </SignOutLink>
        </footer>
      </section>
    </main>
  );
}
