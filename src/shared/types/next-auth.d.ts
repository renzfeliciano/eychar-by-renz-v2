import type { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string };
    /** Set when the session was invalidated — see src/server/auth/session-policy.ts. */
    error?: "ConcurrentSessionError" | "SessionExpired";
    /** ISO time the session this sign-in replaced was last active, until acknowledged. */
    replacedSessionAt?: string;
  }

  interface User extends DefaultUser {
    sessionId?: string;
    replacedSessionAt?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    sessionId?: string;
    lastActivityAt?: number;
    expired?: boolean;
    expiredReason?: "idle_timeout" | "concurrent_session";
    replacedSessionAt?: string;
  }
}
