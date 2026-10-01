import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel } from "@/server/db/models";
import { Logo } from "@/components/shared/logo";
import { ForcedPasswordChange } from "./forced-password-change";
import { BrandName } from "@/components/shared/brand-name";
import { getSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Choose your password", robots: { index: false, follow: false } };

/**
 * Where an account with a temporary password (new, or reset by HR) lands
 * after signing in. Every other page redirects here until it's replaced.
 */
export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  await connectMongoDB();
  const user = await UserModel.findById(session.user.id).select("mustChangePassword employeeId username").lean();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect(user.employeeId ? "/clock" : "/dashboard");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <section aria-labelledby="change-password-title" className="w-full max-w-md overflow-hidden rounded-2xl border bg-background shadow-[var(--shadow-modal)]">
        <div className="relative border-b bg-primary/[0.035] px-6 pt-6 pb-5 sm:px-8 dark:bg-primary/[0.08]">
          <span className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden="true" />
          <div className="flex items-center gap-3">
            <Logo className="size-10 rounded-xl p-1" />
            <div className="flex flex-col leading-tight">
              <BrandName />
              <span className="text-xs text-muted-foreground">Signed in as {user.username ?? "your account"}</span>
            </div>
          </div>
          <h1 id="change-password-title" className="mt-6 text-xl font-semibold tracking-tight">
            Choose your own password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You signed in with a temporary password from your HR team. Replace it with one only you know to continue.
          </p>
        </div>
        <div className="px-6 py-6 sm:px-8">
          <ForcedPasswordChange destination={user.employeeId ? "/clock" : "/dashboard"} />
        </div>
        <footer className="flex items-center gap-2 border-t bg-primary/[0.035] px-6 py-3 text-xs text-muted-foreground sm:px-8 dark:bg-primary/[0.08]">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          HR never sees the password you choose.
        </footer>
      </section>
    </main>
  );
}
