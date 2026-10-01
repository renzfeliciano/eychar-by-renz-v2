"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ACTIVITY_PING_MS, SESSION_IDLE_MS, SESSION_IDLE_WARNING_MS, idleState } from "@/lib/session-idle";
import { BRAND } from "@/lib/brand";

const STORAGE_KEY = `${BRAND.storagePrefix}:last-activity`;
/** Set when one tab signs out for inactivity, so every other open tab leaves too. */
const SIGNED_OUT_KEY = `${BRAND.storagePrefix}:idle-signed-out`;
const IDLE_LOGIN_URL = "/login?reason=idle";
/** How long to wait for the sign-out request before leaving the page anyway. */
const SIGN_OUT_TIMEOUT_MS = 5_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "wheel", "mousemove"] as const;

const RING_RADIUS = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** "0:12", "1:05". */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * What screen readers hear. It changes only when the warning opens and at
 * 30, 10 and 5 seconds, so they aren't read a new number every second.
 */
export function countdownAnnouncement(seconds: number, warningSeconds: number): string {
  const milestone = [5, 10, 30].find((mark) => seconds <= mark && mark < warningSeconds);
  if (milestone) return `${milestone} seconds left before you're signed out.`;
  return `You'll be signed out in ${warningSeconds} seconds unless you choose to stay signed in.`;
}

function readShared(): number {
  try {
    return Number(window.localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Storage unavailable: each tab keeps its own clock.
  }
}

function readSignedOutAt(): number {
  try {
    return Number(window.localStorage.getItem(SIGNED_OUT_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Ends the session and always lands on the sign-in page. next-auth's own
 * redirect only happens if its sign-out request succeeds; when that request
 * failed or hung, the page stayed put and the warning came back. Here the
 * request gets a few seconds, and the page leaves either way (the server's
 * own idle check ends a session that couldn't be ended here).
 */
export async function forceIdleSignOut(leave: (url: string) => void = (url) => window.location.replace(url)): Promise<void> {
  try {
    window.localStorage.setItem(SIGNED_OUT_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: other tabs fall back to their own clocks and the server check.
  }
  try {
    await Promise.race([signOut({ redirect: false }), new Promise((resolve) => window.setTimeout(resolve, SIGN_OUT_TIMEOUT_MS))]);
  } catch {
    // Leave anyway.
  }
  leave(IDLE_LOGIN_URL);
}

/**
 * Signs the person out after the organization's idle limit (default 1
 * minute), warning them with a live countdown for the last seconds (default
 * 15). Activity in any open tab counts. While active, the browser pings the
 * server so its own idle check (the real enforcement) stays in step.
 */
export function IdleSessionGuard({
  idleMs = SESSION_IDLE_MS,
  warningMs = SESSION_IDLE_WARNING_MS,
  onSignOut = forceIdleSignOut,
}: {
  idleMs?: number;
  warningMs?: number;
  /** Test seam; defaults to the real forced sign-out. */
  onSignOut?: () => Promise<void> | void;
}) {
  const { data: session, update } = useSession();
  // Held in a ref: `update` changes identity whenever the session is
  // refetched (every minute, and on tab focus). Depending on it directly
  // restarted the timer effect, which reset the idle clock to "now", so the
  // countdown never reached zero and the warning kept coming back.
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);
  const lastActivity = useRef(0);
  const lastPing = useRef(0);
  // Once set, nothing (activity, another tab, a refetch) can bring the session back.
  const signingOut = useRef(false);
  const onSignOutRef = useRef(onSignOut);
  useEffect(() => {
    onSignOutRef.current = onSignOut;
  }, [onSignOut]);
  const stayButton = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<ReturnType<typeof idleState>>({ phase: "active", remainingMs: idleMs });

  const expire = useCallback(() => {
    if (signingOut.current) return;
    signingOut.current = true;
    setState({ phase: "expired", remainingMs: 0 });
    void onSignOutRef.current();
  }, []);

  const markActive = useCallback(
    (fromUser: boolean) => {
      if (signingOut.current) return;
      const now = Date.now();
      lastActivity.current = now;
      writeShared(now);
      setState(idleState(now, now, idleMs, warningMs));
      if (fromUser && now - lastPing.current >= ACTIVITY_PING_MS) {
        lastPing.current = now;
        void updateRef.current({ activity: true });
      }
    },
    [idleMs, warningMs],
  );

  useEffect(() => {
    // The clock starts when the page mounts (reading the time during render isn't allowed).
    const mountedAt = Date.now();
    lastActivity.current = Math.max(mountedAt, readShared());
    writeShared(lastActivity.current);
    const onActivity = () => {
      if (signingOut.current) return;
      // Once the warning is up, only an explicit "Stay signed in" counts.
      if (idleState(Math.max(lastActivity.current, readShared()), Date.now(), idleMs, warningMs).phase !== "active") return;
      markActive(true);
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });

    const timer = window.setInterval(() => {
      if (signingOut.current) return;
      // Another tab already signed out for inactivity: the session is gone here too.
      if (readSignedOutAt() > mountedAt) return expire();
      const shared = readShared();
      if (shared > lastActivity.current) lastActivity.current = shared;
      const next = idleState(lastActivity.current, Date.now(), idleMs, warningMs);
      if (next.phase === "expired") return expire();
      setState(next);
    }, 1000);

    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      window.clearInterval(timer);
    };
  }, [idleMs, warningMs, markActive, expire]);

  // Loading a page counts as activity, so tell the server once the session has
  // loaded. Without this its idle clock (still counting from the last ping)
  // could run out before this page's, and the two disagreed.
  const sessionLive = Boolean(session && !session.error);
  const pingedOnLoad = useRef(false);
  useEffect(() => {
    if (!sessionLive || pingedOnLoad.current || signingOut.current) return;
    pingedOnLoad.current = true;
    lastPing.current = Date.now();
    void updateRef.current({ activity: true });
  }, [sessionLive]);

  // The server's own idle check ended the session first: leave now rather than count down to nothing.
  const serverExpired = session?.error === "SessionExpired";
  useEffect(() => {
    if (serverExpired) expire();
  }, [serverExpired, expire]);

  const seconds = Math.ceil(state.remainingMs / 1000);
  const warningSeconds = Math.round(warningMs / 1000);
  const open = state.phase !== "active";
  const expired = state.phase === "expired";
  const fraction = Math.max(0, Math.min(1, state.remainingMs / warningMs));
  // The last third (at least the last 5 seconds) turns red; the shrinking
  // number and ring say the same thing for anyone who can't tell the colors apart.
  const urgent = state.remainingMs <= Math.max(5_000, warningMs / 3);

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} initialFocus={stayButton} className="gap-0 p-0 sm:max-w-[22rem]" data-testid="idle-warning-dialog">
        {/* Time left, along the top edge. */}
        <div className="h-1 bg-muted" aria-hidden="true">
          <div
            className={cn("h-full transition-[width,background-color] duration-1000 ease-linear", urgent ? "bg-destructive" : "bg-warning")}
            style={{ width: `${fraction * 100}%` }}
          />
        </div>

        <div className="flex flex-col items-center gap-4 px-6 pt-7 pb-6 text-center">
          <div className="relative size-24" data-testid="idle-countdown">
            <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden="true">
              <circle cx="40" cy="40" r={RING_RADIUS} fill="none" strokeWidth="5" className="stroke-muted" />
              <circle
                cx="40"
                cy="40"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
                className={cn("transition-[stroke-dashoffset,stroke] duration-1000 ease-linear", urgent ? "stroke-destructive" : "stroke-warning")}
              />
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
              <span className={cn("text-2xl font-semibold tracking-tight tabular-nums transition-colors", urgent && "text-destructive")}>{formatCountdown(seconds)}</span>
              <span className="text-[11px] text-muted-foreground">left</span>
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <DialogTitle className="text-lg">{expired ? "Signing you out…" : "Are you still there?"}</DialogTitle>
            <DialogDescription className="text-balance">
              {expired
                ? "You were inactive for too long. Taking you to the sign-in page."
                : "For your security, you’ll be signed out when the timer runs out. Anything you haven’t saved will be lost."}
            </DialogDescription>
          </div>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {expired ? "Signing you out." : open ? countdownAnnouncement(seconds, warningSeconds) : ""}
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-muted/40 p-4 min-[360px]:flex-row">
          <Button
            variant="ghost"
            className="flex-1 text-muted-foreground"
            disabled={expired}
            onClick={expire}
            data-testid="idle-sign-out-button"
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            Sign out now
          </Button>
          <Button ref={stayButton} className="flex-1" disabled={expired} onClick={() => markActive(true)} data-testid="idle-stay-button">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Stay signed in
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
