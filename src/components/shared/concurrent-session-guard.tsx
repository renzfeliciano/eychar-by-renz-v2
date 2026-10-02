"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Clock3, Globe, KeyRound, LogIn, LogOut, MonitorSmartphone, ShieldAlert, ShieldCheck, type LucideIcon, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/app-time";

type Notice = {
  icon: LucideIcon;
  tone: "warning" | "primary";
  title: string;
  description: string;
  points: { icon: LucideIcon; text: string }[];
};

type EndedReason = "ConcurrentSessionError" | "SessionExpired" | "SessionEnded";
type ReplacedBy = { at: string | null; device: string | null; host: string | null };

const ENDED: Record<EndedReason, Notice> = {
  ConcurrentSessionError: {
    icon: MonitorSmartphone,
    tone: "warning",
    title: "Signed in on another device or browser",
    description: "Your account was just signed in somewhere else, which ends this session. Only one place can be signed in at a time.",
    points: [
      {
        icon: ShieldCheck,
        text: "Was it you? Signing in from another browser, the in-app browser, your phone, or a local copy of the app (localhost) ends this session too. Nothing to worry about.",
      },
      { icon: ShieldAlert, text: "Don't recognize it? Sign in again, then change your password under Account › Security." },
    ],
  },
  SessionEnded: {
    icon: LogOut,
    tone: "primary",
    title: "This session was signed out",
    description: "Your account is no longer signed in here.",
    points: [
      { icon: KeyRound, text: "This happens when you sign out in another tab, change your password, or an administrator resets your sign-in." },
      { icon: LogIn, text: "Sign in again to continue." },
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

function NoticeHeader({ notice }: { notice: Notice }) {
  const Icon = notice.icon;
  return (
    <DialogHeader>
      <div className="flex items-start gap-3 pr-8">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            notice.tone === "warning" ? "bg-warning/12 text-warning" : "bg-primary/10 text-primary",
          )}
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
  );
}

// Rendered as the dialog's fixed header (see dialogSlotOf in components/ui/dialog.tsx).
NoticeHeader.dialogSlot = "header" as const;

function NoticePoints({ notice }: { notice: Notice }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {notice.points.map(({ icon: PointIcon, text }) => (
        <li key={text} className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <PointIcon className="mt-0.5 size-4 shrink-0 text-foreground/60" aria-hidden="true" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

/** When and where the sign-in that ended this session happened, so people can tell whether it was them. */
function SignInDetails({ replacedBy }: { replacedBy: ReplacedBy }) {
  const rows = [
    replacedBy.at && { icon: Clock3, label: "When", value: `${formatDateTime(replacedBy.at, { dateStyle: "medium", timeStyle: "short" })} (${lastActive(replacedBy.at)})` },
    replacedBy.device && { icon: MonitorSmartphone, label: "Device", value: replacedBy.device },
    replacedBy.host && { icon: Globe, label: "Site", value: replacedBy.host },
  ].filter((row): row is { icon: LucideIcon; label: string; value: string } => Boolean(row));
  if (rows.length === 0) return null;
  return (
    <dl className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm" data-testid="session-replaced-details">
      {rows.map(({ icon: RowIcon, label, value }) => (
        <div key={label} className="flex items-start gap-2.5">
          <RowIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <dt className="w-14 shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Session notices, driven by the jwt/session callbacks in
 * src/server/auth/options.ts (see src/server/auth/session-policy.ts):
 * - this session was ended (signed in elsewhere / signed out / idle) → explained sign-out;
 * - this sign-in replaced a live session elsewhere → an info notice, shown
 *   once and acknowledged server-side so it doesn't return on reload.
 */
export function ConcurrentSessionGuard() {
  const { data: session, update } = useSession();
  // Keyed by the value itself so a *new* distinct error later is shown again.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const error = session?.error as EndedReason | undefined;
  const replacedAt = session?.replacedSessionAt;

  if (error && dismissedFor !== error) {
    const notice = ENDED[error] ?? ENDED.SessionExpired;
    return (
      // The session is already over: this can't be closed (no ×, Esc or outside click),
      // only left by signing in again. Staying on the page would just fail every request.
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <NoticeHeader notice={notice} />
          {error === "ConcurrentSessionError" && session?.replacedBy && <SignInDetails replacedBy={session.replacedBy} />}
          <NoticePoints notice={notice} />
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
    const notice: Notice = {
      icon: MonitorSmartphone,
      tone: "primary",
      title: "Signed out on your other device",
      description: `Your account was open on another device or browser (last active ${lastActive(replacedAt)}). That session has been signed out.`,
      points: [
        { icon: ShieldCheck, text: "This is now the only active session on your account." },
        { icon: ShieldAlert, text: "If this wasn't you, change your password right away." },
      ],
    };
    return (
      <Dialog open onOpenChange={acknowledge}>
        <DialogContent className="sm:max-w-md">
          <NoticeHeader notice={notice} />
          <NoticePoints notice={notice} />
          <DialogFooter>
            <Button onClick={acknowledge} icon={Check}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
