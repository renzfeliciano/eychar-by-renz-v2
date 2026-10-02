"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, KeyRound, LockKeyhole, UserRound, UsersRound } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type NoAccessDetails = {
  /** The specific reason, e.g. "You don't have access to view payroll runs." */
  message: string;
  /** Permission the page checks, e.g. "payroll-runs.read" (absent for Super-Administrator-only pages). */
  permission?: string;
  /** Human description of that permission, from the permission catalog. */
  permissionLabel?: string;
  /** Only the Super Administrator can open this page. */
  superAdminOnly?: boolean;
  /** Who is signed in, and the roles they hold here. */
  signedInAs?: string;
  roleNames?: string[];
  backHref?: string;
  backLabel?: string;
};

/** The ready-to-send note for an administrator: what's needed, and for whom. */
export function accessRequestText(details: Pick<NoAccessDetails, "permission" | "permissionLabel" | "superAdminOnly" | "signedInAs">, pageUrl?: string): string {
  const needed = details.superAdminOnly
    ? "This page is only for the Super Administrator."
    : `Could you add "${details.permissionLabel ?? details.permission ?? "this page's access"}"${details.permission ? ` (${details.permission})` : ""} to my role?`;
  return [`Hi, I need access to a page in EychAr.`, needed, details.signedInAs ? `My account: ${details.signedInAs}` : null, pageUrl ? `Page: ${pageUrl}` : null]
    .filter(Boolean)
    .join("\n");
}

function DetailRow({ icon: Icon, label, children }: { icon: typeof KeyRound; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
        <dd className="min-w-0 text-sm break-words text-foreground">{children}</dd>
      </div>
    </div>
  );
}

/**
 * The "you can't open this" screen: says exactly which access is missing,
 * what the person has now, and gives them a one-tap way to ask for it,
 * plus a way back. Purely presentational; NoAccessState loads the details.
 */
export function NoAccessCard({ message, permission, permissionLabel, superAdminOnly, signedInAs, roleNames, backHref = "/dashboard", backLabel = "Back to dashboard" }: NoAccessDetails) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  async function copyRequest() {
    const text = accessRequestText({ permission, permissionLabel, superAdminOnly, signedInAs }, typeof window !== "undefined" ? window.location.href : undefined);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Request copied", { description: "Paste it in a message to your administrator." });
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Couldn't copy automatically", { description: text });
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] items-center justify-center py-6" data-testid="no-access-state">
      <section aria-labelledby="no-access-title" className="w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
        <div className="relative flex flex-col items-center gap-4 overflow-hidden border-b bg-gradient-to-b from-primary/[0.07] to-transparent px-6 pt-10 pb-7 text-center sm:px-10">
          {/* Soft concentric rings behind the lock: decorative only. */}
          <div aria-hidden="true" className="pointer-events-none absolute top-6 left-1/2 size-40 -translate-x-1/2 rounded-full border border-primary/10" />
          <div aria-hidden="true" className="pointer-events-none absolute top-0 left-1/2 size-56 -translate-x-1/2 rounded-full border border-primary/[0.06]" />
          <span className="relative flex size-16 items-center justify-center rounded-2xl bg-card text-primary shadow-sm ring-1 ring-primary/15" aria-hidden="true">
            <LockKeyhole className="size-7" />
          </span>
          <div className="relative flex flex-col gap-1.5">
            <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">Access restricted</p>
            <h1 id="no-access-title" className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              You can&apos;t open this page yet
            </h1>
            <p role="status" className="mx-auto max-w-sm text-sm text-pretty text-muted-foreground">
              {message}
            </p>
          </div>
        </div>

        <dl className="divide-y px-6 py-5 sm:px-10">
          <DetailRow icon={KeyRound} label="Access needed">
            {superAdminOnly ? (
              "Super Administrator"
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <span>{permissionLabel ?? "Permission for this page"}</span>
                {permission && <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{permission}</code>}
              </span>
            )}
          </DetailRow>
          {roleNames && (
            <DetailRow icon={UsersRound} label="Your roles">
              {roleNames.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {roleNames.map((name) => (
                    <span key={name} className="rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium">
                      {name}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-muted-foreground">No roles yet</span>
              )}
            </DetailRow>
          )}
          {signedInAs && (
            <DetailRow icon={UserRound} label="Signed in as">
              {signedInAs}
            </DetailRow>
          )}
        </dl>

        <div className="flex flex-col gap-4 border-t bg-muted/30 px-6 py-5 sm:px-10">
          <p className="text-sm text-muted-foreground">
            {superAdminOnly
              ? "Only the Super Administrator can open this page. If you need something here, ask them."
              : "An administrator can add this access to your role under Settings › Roles & access. Copy a ready-made request to send them."}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => router.back()} className="sm:-ml-2">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Go back
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={copyRequest} data-testid="no-access-copy-request">
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? "Copied" : "Copy request"}
              </Button>
              <Link href={backHref} className={cn(buttonVariants({ variant: "default" }))} data-testid="no-access-back-link">
                {backLabel}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
