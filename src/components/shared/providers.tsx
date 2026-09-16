"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  // refetchInterval polls the session periodically so a concurrent-login or
  // idle-timeout invalidation (src/server/auth/session-policy.ts) is caught
  // even if the user never navigates or refocuses the tab.
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionProvider refetchInterval={60}>{children}</SessionProvider>
    </ThemeProvider>
  );
}
