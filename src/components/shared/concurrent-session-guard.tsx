"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const COPY: Record<string, { title: string; description: string }> = {
  ConcurrentSessionError: {
    title: "Signed in elsewhere",
    description: "Your account was just signed in on another device or browser, which ends this session.",
  },
  SessionExpired: {
    title: "Session expired",
    description: "You've been signed out due to inactivity. Please sign in again to continue.",
  },
};

/**
 * Watches the session for the error set by the jwt/session callbacks in
 * src/server/auth/options.ts (see src/server/auth/session-policy.ts) and
 * forces an immediate, explained sign-out instead of leaving the user on a
 * page that will just start failing requests.
 */
export function ConcurrentSessionGuard() {
  const { data: session } = useSession();
  // Keyed by the error value itself (not a plain boolean) so a *new*
  // distinct error occurring later is shown again even if an earlier one
  // was dismissed — no effect needed to "reset" anything.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const error = session?.error;

  if (!error || dismissedFor === error) return null;

  const copy = COPY[error] ?? COPY.SessionExpired;

  return (
    <Dialog open onOpenChange={() => setDismissedFor(error)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => signOut({ callbackUrl: "/login" })}>Sign in again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
