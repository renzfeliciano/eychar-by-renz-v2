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
    <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="min-w-0 text-sm break-words text-foreground">{children}</dd>
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
      <section aria-labelledby="no-access-title" className="w-full max-w-lg overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-raised)]">
        <div className="flex items-start gap-4 border-b px-6 pt-7 pb-6 sm:px-8">
          <LockKeyhole className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1.5">
            <h1 id="no-access-title" className="text-xl leading-tight font-semibold tracking-[-0.015em] text-balance">
              You can&apos;t open this page yet
            </h1>
            <p role="status" className="max-w-sm text-sm text-pretty text-muted-foreground">
              {message}
            </p>
          </div>
        </div>

        <dl className="divide-y divide-rule px-6 py-5 sm:px-8">
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
                    <span key={name} className="rounded-[5px] border bg-background px-2 py-0.5 text-xs font-medium">
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

        <div className="flex flex-col gap-4 border-t bg-muted/40 px-6 py-5 sm:px-8">
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
