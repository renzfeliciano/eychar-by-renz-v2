"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { installSessionExpiryInterceptor } from "@/lib/session-expiry-interceptor";

const LOGIN_URL = "/login?reason=expired";
/** Ignore further refusals for this long after a check, so a burst of failed saves checks once. */
const COOLDOWN_MS = 3_000;
const UPDATE_ATTEMPTS = 3;

type SessionState = "valid" | "ended" | "gone" | "unknown";

/** Asks the server what state this browser's session is in. Reading it credits no activity. */
async function readSessionState(): Promise<SessionState> {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
    const body = (await response.json().catch(() => null)) as { user?: { id?: string }; error?: string } | null;
    if (body?.user?.id) return "valid";
    return body?.error ? "ended" : "gone";
  } catch {
    // Offline or the server is unreachable: that is not the same as signed out.
    return "unknown";
  }
}

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Closes the gap between the server ending a session and this browser finding out
 * (it only polls once a minute). When one of our own API calls comes back 401, this
 * checks the session at once and acts:
 *  - ended by the server (idle, replaced by another sign-in, signed out elsewhere):
 *    pushes that state into the page's session, so the existing sign-out notices
 *    (IdleSessionGuard, ConcurrentSessionGuard) show the right reason and leave;
 *  - no session at all: goes to the sign-in page;
 *  - still valid, or the server can't be reached: does nothing, so a stray 401 or
 *    a dropped connection never signs anyone out.
 * Renders nothing. Mount once, inside the SessionProvider.
 */
export function SessionExpiryWatcher({
  onLeave = (url: string) => window.location.replace(url),
  retryDelayMs = 600,
}: {
  /** Test seam; defaults to a full navigation. */
  onLeave?: (url: string) => void;
  retryDelayMs?: number;
}) {
  const { update } = useSession();
  // Held in a ref so a refreshed session (new `update` identity) doesn't reinstall the interceptor.
  const updateRef = useRef(update);
  const leaveRef = useRef(onLeave);
  useEffect(() => {
    updateRef.current = update;
    leaveRef.current = onLeave;
  }, [update, onLeave]);

  useEffect(() => {
    let busy = false;
    let released: number | undefined;

    async function check() {
      if (busy) return;
      busy = true;
      try {
        // Already on the sign-in page: nothing to leave.
        if (window.location.pathname.startsWith("/login")) return;
        const state = await readSessionState();
        if (state === "valid" || state === "unknown") return;
        if (state === "gone") return leaveRef.current(LOGIN_URL);

        for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt += 1) {
          if (await updateRef.current()) return;
          // The provider was busy refetching; give it a moment and ask again.
          await pause(retryDelayMs);
        }
        leaveRef.current(LOGIN_URL);
      } finally {
        released = window.setTimeout(() => {
          busy = false;
        }, COOLDOWN_MS);
      }
    }

    const stop = installSessionExpiryInterceptor(() => void check());
    return () => {
      stop();
      if (released !== undefined) window.clearTimeout(released);
    };
  }, [retryDelayMs]);

  return null;
}
