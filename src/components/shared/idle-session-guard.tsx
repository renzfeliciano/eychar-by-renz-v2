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

/**
 * Signs the person out after the organization's idle limit (default 1
 * minute), warning them with a live countdown for the last seconds (default
 * 15). Activity in any open tab counts. While active, the browser pings the
 * server so its own idle check (the real enforcement) stays in step.
 */
export function IdleSessionGuard({ idleMs = SESSION_IDLE_MS, warningMs = SESSION_IDLE_WARNING_MS }: { idleMs?: number; warningMs?: number }) {
  const { update } = useSession();
  const lastActivity = useRef(0);
  const lastPing = useRef(0);
  const signingOut = useRef(false);
  const stayButton = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<ReturnType<typeof idleState>>({ phase: "active", remainingMs: idleMs });

  const markActive = useCallback(
    (fromUser: boolean) => {
      const now = Date.now();
      lastActivity.current = now;
      writeShared(now);
      setState(idleState(now, now, idleMs, warningMs));
      if (fromUser && now - lastPing.current >= ACTIVITY_PING_MS) {
        lastPing.current = now;
        void update({ activity: true });
      }
    },
    [idleMs, warningMs, update],
  );

  useEffect(() => {
    // The clock starts when the page mounts (reading the time during render isn't allowed).
    lastActivity.current = Math.max(Date.now(), readShared());
    writeShared(lastActivity.current);
    const onActivity = () => {
      // Once the warning is up, only an explicit "Stay signed in" counts.
      if (idleState(Math.max(lastActivity.current, readShared()), Date.now(), idleMs, warningMs).phase !== "active") return;
      markActive(true);
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });

    const timer = window.setInterval(() => {
      const shared = readShared();
      if (shared > lastActivity.current) lastActivity.current = shared;
      const next = idleState(lastActivity.current, Date.now(), idleMs, warningMs);
      setState(next);
      if (next.phase === "expired" && !signingOut.current) {
        signingOut.current = true;
        void signOut({ callbackUrl: "/login?reason=idle" });
      }
    }, 1000);

    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      window.clearInterval(timer);
    };
  }, [idleMs, warningMs, markActive]);

  const seconds = Math.ceil(state.remainingMs / 1000);
  const warningSeconds = Math.round(warningMs / 1000);
  const open = state.phase !== "active";
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
            <DialogTitle className="text-lg">Are you still there?</DialogTitle>
            <DialogDescription className="text-balance">
              For your security, you&apos;ll be signed out when the timer runs out. Anything you haven&apos;t saved will be lost.
            </DialogDescription>
          </div>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {open ? countdownAnnouncement(seconds, warningSeconds) : ""}
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-muted/40 p-4 min-[360px]:flex-row">
          <Button
            variant="ghost"
            className="flex-1 text-muted-foreground"
            onClick={() => {
              signingOut.current = true;
              void signOut({ callbackUrl: "/login?reason=idle" });
            }}
            data-testid="idle-sign-out-button"
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            Sign out now
          </Button>
          <Button ref={stayButton} className="flex-1" onClick={() => markActive(true)} data-testid="idle-stay-button">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Stay signed in
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
