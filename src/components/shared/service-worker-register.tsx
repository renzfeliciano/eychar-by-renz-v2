"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js so the app is installable and shows an offline page
 * instead of the browser's error (ADR-036). Production only: in `next dev`
 * a service worker would fight hot reload. Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Not fatal: the app works the same without it, just not offline-aware.
    });
  }, []);
  return null;
}
