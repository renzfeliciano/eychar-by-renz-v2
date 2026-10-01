"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Clock3, LogIn, MonitorSmartphone, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Notice = {
  icon: LucideIcon;
  tone: "warning" | "primary";
  title: string;
  description: string;
  points: { icon: LucideIcon; text: string }[];
};

const ENDED: Record<"ConcurrentSessionError" | "SessionExpired", Notice> = {
  ConcurrentSessionError: {
    icon: MonitorSmartphone,
    tone: "warning",
    title: "Signed in elsewhere",
    description: "Your account was just signed in on another device or browser, which ends this session.",
    points: [
      { icon: ShieldCheck, text: "Only one session per account can be active at a time, to keep your account secure." },
      { icon: ShieldAlert, text: "If this wasn't you, sign in again and change your password right away." },
    ],
  },
  SessionExpired: {
    icon: Clock3,
    tone: "warning",
    title: "Session expired",
    description: "You've been signed out due to inactivity.",
    points: [
      { icon: ShieldCheck, text: "Sessions end after a period of inactivity so an unattended screen can't be used by someone else." },
      { icon: LogIn, text: "Sign in again to pick up where you left off." },
    ],
  },
};

function lastActive(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function NoticeBody({ notice }: { notice: Notice }) {
  const Icon = notice.icon;
  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-3 pr-8">
          <span
            className={
              notice.tone === "warning"
                ? "flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/12 text-warning"
                : "flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            }
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle>{notice.title}</DialogTitle>
            <DialogDescription>{notice.description}</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <ul className="flex flex-col gap-2.5">
        {notice.points.map(({ icon: PointIcon, text }) => (
          <li key={text} className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <PointIcon className="mt-0.5 size-4 shrink-0 text-foreground/60" aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Session notices, driven by the jwt/session callbacks in
 * src/server/auth/options.ts (see src/server/auth/session-policy.ts):
 * - this session was ended (signed in elsewhere / idle) → explained sign-out;
 * - this sign-in replaced a live session elsewhere → an info notice, shown
 *   once and acknowledged server-side so it doesn't return on reload.
 */
export function ConcurrentSessionGuard() {
  const { data: session, update } = useSession();
  // Keyed by the value itself so a *new* distinct error later is shown again.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const error = session?.error;
  const replacedAt = session?.replacedSessionAt;

  if (error && dismissedFor !== error) {
    return (
      // The session is already over: this can't be closed (no ×, Esc or outside click),
      // only left by signing in again. Staying on the page would just fail every request.
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent showCloseButton={false}>
          <NoticeBody notice={ENDED[error] ?? ENDED.SessionExpired} />
          <DialogFooter>
            <Button onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogIn className="size-4" aria-hidden="true" />
              Sign in again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!error && replacedAt && dismissedFor !== replacedAt) {
    const acknowledge = () => {
      setDismissedFor(replacedAt);
      void update({ acknowledgeReplacedSession: true });
    };
    return (
      <Dialog open onOpenChange={acknowledge}>
        <DialogContent>
          <NoticeBody
            notice={{
              icon: MonitorSmartphone,
              tone: "primary",
              title: "Signed out on your other device",
              description: `Your account was open on another device or browser (last active ${lastActive(replacedAt)}). That session has been signed out.`,
              points: [
                { icon: ShieldCheck, text: "This is now the only active session on your account." },
                { icon: ShieldAlert, text: "If this wasn't you, change your password right away." },
              ],
            }}
          />
          <DialogFooter>
            <Button onClick={acknowledge}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
