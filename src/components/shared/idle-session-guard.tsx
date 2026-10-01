"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Clock3, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACTIVITY_PING_MS, SESSION_IDLE_MS, SESSION_IDLE_WARNING_MS, idleState } from "@/lib/session-idle";

const STORAGE_KEY = "workforcehub:last-activity";
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "wheel", "mousemove"] as const;

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
  const open = state.phase !== "active";

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/12 text-warning" aria-hidden="true">
              <Clock3 className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <DialogTitle>Are you still there?</DialogTitle>
              <DialogDescription aria-live="assertive">
                You&apos;ll be signed out in {seconds} second{seconds === 1 ? "" : "s"} for your security.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-warning transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (state.remainingMs / warningMs) * 100)}%` }} />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              signingOut.current = true;
              void signOut({ callbackUrl: "/login?reason=idle" });
            }}
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            Sign out now
          </Button>
          <Button onClick={() => markActive(true)}>Stay signed in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
