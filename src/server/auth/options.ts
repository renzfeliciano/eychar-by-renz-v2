import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { randomUUID } from "crypto";
import { signInWithPassword } from "@/domains/identity/sign-in";
import { clientIp } from "@/domains/identity/login-guard";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel } from "@/server/db/models";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { SecuritySettingsService } from "@/domains/identity/security-settings-service";
import { SERVER_IDLE_GRACE_MS } from "@/lib/session-idle";
import { replacedSessionActivity, resolveSessionState } from "./session-policy";
import { getInactivityMs } from "./inactivity";
import { BRAND } from "@/lib/brand";

/** Who may see records hidden as test data (ADR-034): the Super Administrator, and a self-service employee (their own records only). */
/** The idle limit for this account's organization (Settings › Security). */
async function idleLimitMs(userId: string): Promise<number> {
  return (await SecuritySettingsService.forUser(userId)).idleTimeoutSeconds * 1000;
}

async function viewerMaySeeHidden(userId: string): Promise<boolean> {
  await connectMongoDB();
  const user = await UserModel.findById(userId).select("employeeId").lean();
  return Boolean(user?.employeeId) || (await SuperAdminService.isSuperAdminAnywhere(userId));
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  // JWT strategy: authentication (this file) stays fully separate from
  // authorization (src/server/authorization/authorize.ts), which is
  // re-resolved from RoleAssignment/Role on every request rather than
  // cached in the token (AGENTS.md §19).
  session: {
    strategy: "jwt",
    // No fixed maximum: a session ends when it's idle past the organization's
    // limit (Settings › Security) or when the account signs in elsewhere.
    maxAge: 60 * 60 * 24 * 30,
  },

  pages: {
    signIn: "/login",
  },

  providers: [
    CredentialsProvider({
      name: BRAND.fullName,
      credentials: {
        login: { label: "Username or email", type: "text" },
        password: { label: "Password", type: "password" },
        otp: { label: "Authentication code", type: "text" },
      },
      async authorize(credentials, req) {
        const result = await signInWithPassword(credentials, { ip: clientIp(req?.headers) });
        if (!result.ok) {
          // A wrong password or unknown account returns null (NextAuth's
          // generic "CredentialsSignin"). The other outcomes are thrown so the
          // sign-in page can show what to do next; their codes are listed in
          // src/app/(auth)/login/sign-in-messages.ts.
          if (result.reason === "invalid") return null;
          throw new Error(result.reason);
        }

        // Single-active-session enforcement: this login supersedes any
        // other open session on this account (src/server/auth/session-policy.ts).
        const sessionId = randomUUID();
        const previous = await UserModel.findById(result.userId).select("activeSessionId lastActivityAt").lean();
        const replacedAt = replacedSessionActivity({
          previousSessionId: previous?.activeSessionId,
          lastActivityAt: previous?.lastActivityAt,
          now: Date.now(),
          inactivityMs: (await idleLimitMs(result.userId)) + SERVER_IDLE_GRACE_MS,
        });
        await UserModel.updateOne({ _id: result.userId }, { $set: { activeSessionId: sessionId, lastActivityAt: new Date() } });

        return { id: result.userId, email: result.email, name: result.username, sessionId, replacedSessionAt: replacedAt?.toISOString() };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id;
        token.sessionId = user.sessionId;
        token.replacedSessionAt = user.replacedSessionAt;
        token.seesHidden = await viewerMaySeeHidden(user.id);
        token.idleMs = await idleLimitMs(user.id);
        token.lastActivityAt = Date.now();
        token.expired = false;
        return token;
      }

      if (!token.userId || !token.sessionId) return token;
      // Sessions from before hidden test data existed pick the flag up once.
      if (token.seesHidden === undefined) token.seesHidden = await viewerMaySeeHidden(token.userId as string);
      // The person has read the "signed out on your other device" notice.
      if (trigger === "update" && session?.acknowledgeReplacedSession) delete token.replacedSessionAt;
      // Only real activity (pinged by the idle guard) or an explicit update keeps the session alive;
      // background session polling just checks it. Picks up a changed idle limit at the same time.
      const isActivity = trigger === "update";
      if (isActivity || token.idleMs === undefined) token.idleMs = await idleLimitMs(token.userId as string);

      await connectMongoDB();
      const currentUser = await UserModel.findOne({ _id: token.userId, status: "active" })
        .select("activeSessionId lastActivityAt")
        .lean();

      const state = resolveSessionState({
        tokenSessionId: token.sessionId,
        tokenLastActivityAt: token.lastActivityAt ?? 0,
        now: Date.now(),
        inactivityMs: (token.idleMs ?? getInactivityMs()) + SERVER_IDLE_GRACE_MS,
        currentUser: currentUser ? { activeSessionId: currentUser.activeSessionId } : null,
      });

      if (state.expired) {
        token.expired = true;
        token.expiredReason = state.reason;
        return token;
      }

      token.expired = false;
      if (!isActivity) return token;
      token.lastActivityAt = Date.now();
      // Keep the account's last activity roughly current (at most one write a
      // minute), so a sign-in elsewhere can tell whether this session was live.
      if (!currentUser?.lastActivityAt || Date.now() - new Date(currentUser.lastActivityAt).getTime() > 60_000) {
        await UserModel.updateOne({ _id: token.userId }, { $set: { lastActivityAt: new Date() } });
      }
      return token;
    },

    async session({ session, token }) {
      if (token.expired) {
        session.error = token.expiredReason === "concurrent_session" ? "ConcurrentSessionError" : "SessionExpired";
        return session;
      }
      if (token.userId) session.user.id = token.userId as string;
      if (token.replacedSessionAt) session.replacedSessionAt = token.replacedSessionAt;
      return session;
    },
  },
};
