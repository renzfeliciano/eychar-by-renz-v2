"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { SessionExpiryWatcher } from "./session-expiry-watcher";

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  // refetchInterval polls the session periodically so a concurrent-login or
  // idle-timeout invalidation (src/server/auth/session-policy.ts) is caught
  // even if the user never navigates or refocuses the tab.
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
      <SessionProvider refetchInterval={60}>
        {/* Catches a 401 from any save in the gap before that poll notices (see SessionExpiryWatcher). */}
        <SessionExpiryWatcher />
        {children}
      </SessionProvider>
    </ThemeProvider>
  );
}
