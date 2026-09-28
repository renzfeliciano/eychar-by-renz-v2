"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, LockOpen, MoreHorizontal, ShieldOff, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormError } from "@/components/shared/form-field";

type Action = "reset-password" | "unlock" | "disable" | "enable" | "reset-mfa";

const CONFIRM: Record<Action, { title: (name: string) => string; description: string; label: string; busy: string; destructive?: boolean }> = {
  "reset-password": {
    title: (name) => `Reset ${name}'s password?`,
    description: "Their current password stops working and any open session ends. You'll get a temporary password to give them; they must replace it when they sign in.",
    label: "Reset password",
    busy: "Resetting…",
  },
  unlock: { title: (name) => `Unlock ${name}'s account?`, description: "They can sign in again right away instead of waiting for the lock to expire.", label: "Unlock", busy: "Unlocking…" },
  disable: {
    title: (name) => `Disable ${name}'s account?`,
    description: "They're signed out and can't sign in until the account is enabled again. Their records stay as they are.",
    label: "Disable account",
    busy: "Disabling…",
    destructive: true,
  },
  enable: { title: (name) => `Enable ${name}'s account?`, description: "They can sign in again with their current password.", label: "Enable account", busy: "Enabling…" },
  "reset-mfa": {
    title: (name) => `Reset ${name}'s two-step verification?`,
    description: "Use this when they've lost their phone and recovery codes. Sign-in will ask only for their password until they set it up again.",
    label: "Reset two-step verification",
    busy: "Resetting…",
    destructive: true,
  },
};

const DONE: Record<Exclude<Action, "reset-password">, string> = {
  unlock: "Account unlocked",
  disable: "Account disabled",
  enable: "Account enabled",
  "reset-mfa": "Two-step verification reset",
};

/** The ⋯ menu on an account row: each action is confirmed first, and a password reset shows the temporary password once. */
export function AccountActions({
  organizationId,
  account,
  isSelf,
}: {
  organizationId: string;
  account: { id: string; displayName: string; status: "active" | "disabled"; locked: boolean; mfaEnabled: boolean };
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  async function run(action: Action) {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/users/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, action }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(body.error ?? "That didn't work. Please try again.");
    setPending(null);
    if (action === "reset-password") setTemporaryPassword(body.temporaryPassword);
    else toast.success(DONE[action]);
    router.refresh();
  }

  const confirm = pending ? CONFIRM[pending] : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${account.displayName}`}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setPending("reset-password")}>
            <KeyRound className="size-4" aria-hidden="true" />
            Reset password
          </DropdownMenuItem>
          {account.locked && (
            <DropdownMenuItem onClick={() => setPending("unlock")}>
              <LockOpen className="size-4" aria-hidden="true" />
              Unlock
            </DropdownMenuItem>
          )}
          {account.mfaEnabled && (
            <DropdownMenuItem onClick={() => setPending("reset-mfa")}>
              <ShieldOff className="size-4" aria-hidden="true" />
              Reset two-step verification
            </DropdownMenuItem>
          )}
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              {account.status === "active" ? (
                <DropdownMenuItem variant="destructive" onClick={() => setPending("disable")}>
                  <UserX className="size-4" aria-hidden="true" />
                  Disable account
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setPending("enable")}>
                  <UserCheck className="size-4" aria-hidden="true" />
                  Enable account
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {pending && confirm && (
        <Dialog open onOpenChange={(open) => !open && !busy && setPending(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{confirm.title(account.displayName)}</DialogTitle>
              <DialogDescription>{confirm.description}</DialogDescription>
            </DialogHeader>
            <FormError message={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPending(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" variant={confirm.destructive ? "destructive" : "default"} onClick={() => run(pending)} disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {busy ? confirm.busy : confirm.label}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {temporaryPassword && (
        <Dialog open onOpenChange={(open) => !open && setTemporaryPassword(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Temporary password for {account.displayName}</DialogTitle>
              <DialogDescription>Give it to them in person or by phone, not by email. It works once: they&apos;ll choose their own at sign-in. It won&apos;t be shown again.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <code className="flex-1 font-mono text-lg tracking-wide">{temporaryPassword}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(temporaryPassword);
                  toast.success("Copied");
                }}
              >
                <Copy className="size-3.5" aria-hidden="true" />
                Copy
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setTemporaryPassword(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
