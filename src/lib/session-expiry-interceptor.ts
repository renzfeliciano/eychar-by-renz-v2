/**
 * Notices when the server refuses one of our own API calls as "not signed in"
 * (HTTP 401), whichever form or button made it. The browser only learns a session
 * ended by polling once a minute, so a person who saves in that gap gets a 401 that
 * each form would otherwise print as a bare error. Hooking `fetch` once covers every
 * current and future caller without changing any of them.
 *
 * The response is returned untouched. Only our own API counts: same origin, under
 * /api/, and not /api/auth (the sign-in machinery, which must not trigger itself).
 */

type Listener = () => void;
type FetchWindow = Window & typeof globalThis;

const listeners = new Set<Listener>();
let removeWrapper: (() => void) | null = null;

function isOurApiCall(input: Parameters<typeof fetch>[0], win: FetchWindow): boolean {
  let raw: string;
  if (typeof Request !== "undefined" && input instanceof Request) raw = input.url;
  else if (input instanceof URL) raw = input.href;
  else raw = String(input);
  try {
    const url = new URL(raw, win.location.href);
    if (url.origin !== win.location.origin) return false;
    const path = url.pathname;
    return path.startsWith("/api/") && path !== "/api/auth" && !path.startsWith("/api/auth/");
  } catch {
    return false;
  }
}

/** Calls `onRejected` for each 401 from our API. Returns a function that stops listening. Safe to call more than once. */
export function installSessionExpiryInterceptor(onRejected: Listener, win: FetchWindow = window): () => void {
  listeners.add(onRejected);

  if (!removeWrapper) {
    const original = win.fetch;
    const wrapped: typeof fetch = async (...args) => {
      const response = await original.apply(win, args);
      if (response.status === 401 && isOurApiCall(args[0], win)) {
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch {
            // One listener failing must not break the request or the others.
          }
        }
      }
      return response;
    };
    win.fetch = wrapped;
    removeWrapper = () => {
      // Only put it back if nobody wrapped it again after us.
      if (win.fetch === wrapped) win.fetch = original;
      removeWrapper = null;
    };
  }

  return () => {
    listeners.delete(onRejected);
    if (listeners.size === 0) removeWrapper?.();
  };
}
