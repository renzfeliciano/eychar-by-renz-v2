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
import { getInactivityMs, getSessionMaxAgeMs } from "./inactivity";
import { BRAND } from "@/lib/brand";
import { describeDevice, readHeader } from "@/lib/user-agent";

/** The idle limit for this account's organization (Settings › Security). */
async function idleLimitMs(userId: string): Promise<number> {
  return (await sessionSettings(userId)).idleMs;
}

/** The organization's session settings this token caches (refreshed on activity). */
async function sessionSettings(userId: string): Promise<{ idleMs: number; twoStepRequired: boolean }> {
  const settings = await SecuritySettingsService.forUser(userId);
  return { idleMs: settings.idleTimeoutSeconds * 1000, twoStepRequired: settings.requireTwoStepForStaff };
}

/** A staff account (no linked employee) in an organization that requires two-step, without it on yet. */
function needsTwoStepSetup(twoStepRequired: boolean | undefined, user: { employeeId?: unknown; mfa?: { enabled?: boolean } } | null | undefined): boolean {
  return Boolean(twoStepRequired && user && !user.employeeId && !user.mfa?.enabled);
}

/** Who may see records hidden as test data (ADR-034): the Super Administrator, and a self-service employee (their own records only). */
async function viewerMaySeeHidden(userId: string, employeeId?: unknown): Promise<boolean> {
  return Boolean(employeeId) || (await SuperAdminService.isSuperAdminAnywhere(userId));
}

/** Ends this session's hold on the account, if it is still the account's active session. */
async function endActiveSession(userId: string, sessionId: string): Promise<void> {
  await connectMongoDB();
  await UserModel.updateOne({ _id: userId, activeSessionId: sessionId }, { $unset: { activeSessionId: 1 } });
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  // JWT strategy: authentication (this file) stays fully separate from
  // authorization (src/server/authorization/authorize.ts), which is
  // re-resolved from RoleAssignment/Role on every request rather than
  // cached in the token (AGENTS.md §19).
  session: {
    strategy: "jwt",
    // The cookie's own lifetime. A session really ends sooner: when it's idle
    // past the organization's limit (Settings › Security), when it reaches
    // SESSION_MAX_HOURS since sign-in, or when the account signs in elsewhere,
    // signs out, or changes its password (all enforced in the jwt callback).
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
        await UserModel.updateOne(
          { _id: result.userId },
          {
            $set: {
              activeSessionId: sessionId,
              lastActivityAt: new Date(),
              lastSignInDevice: describeDevice(readHeader(req?.headers, "user-agent")),
              lastSignInHost: (readHeader(req?.headers, "x-forwarded-host") ?? readHeader(req?.headers, "host") ?? "").slice(0, 200) || undefined,
            },
          },
        );

        return { id: result.userId, email: result.email, name: result.username, sessionId, replacedSessionAt: replacedAt?.toISOString(), mustChangePassword: result.mustChangePassword };
      },
    }),
  ],

  events: {
    // Signing out ends the session server-side too, so a copy of the cookie
    // taken before sign-out stops working (it no longer matches activeSessionId).
    async signOut({ token }) {
      if (!token?.userId || !token.sessionId) return;
      try {
        await endActiveSession(token.userId, token.sessionId);
      } catch (error) {
        console.error("Couldn't end the session on sign-out", error);
      }
    },
  },

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const now = Date.now();
        await connectMongoDB();
        const signedIn = await UserModel.findById(user.id).select("employeeId mfa.enabled").lean();
        const settings = await sessionSettings(user.id);
        token.userId = user.id;
        token.sessionId = user.sessionId;
        token.replacedSessionAt = user.replacedSessionAt;
        token.mustChangePassword = Boolean(user.mustChangePassword);
        token.seesHidden = await viewerMaySeeHidden(user.id, signedIn?.employeeId);
        token.idleMs = settings.idleMs;
        token.twoStepRequired = settings.twoStepRequired;
        token.mustSetUpTwoStep = needsTwoStepSetup(settings.twoStepRequired, signedIn);
        token.lastActivityAt = now;
        token.signedInAt = now;
        token.expired = false;
        return token;
      }

      if (!token.userId || !token.sessionId) return token;
      // An ended session stays ended (a later sign-in issues a new token), and grants nothing.
      if (token.expired) {
        token.seesHidden = false;
        return token;
      }
      // Sessions from before the absolute lifetime existed start counting now.
      if (typeof token.signedInAt !== "number") token.signedInAt = Date.now();
      // The person has read the "signed out on your other device" notice.
      if (trigger === "update" && session?.acknowledgeReplacedSession) delete token.replacedSessionAt;
      // Only real activity (pinged by the idle guard) or an explicit update keeps the session alive;
      // background session polling just checks it. Picks up a changed idle limit at the same time.
      const isActivity = trigger === "update";
      if (isActivity || token.idleMs === undefined || token.twoStepRequired === undefined) {
        const settings = await sessionSettings(token.userId as string);
        token.idleMs = settings.idleMs;
        token.twoStepRequired = settings.twoStepRequired;
      }

      await connectMongoDB();
      const currentUser = await UserModel.findOne({ _id: token.userId, status: "active" })
        .select("activeSessionId lastActivityAt mustChangePassword employeeId mfa.enabled lastSignInAt lastSignInDevice lastSignInHost")
        .lean();

      const state = resolveSessionState({
        tokenSessionId: token.sessionId,
        tokenLastActivityAt: token.lastActivityAt ?? 0,
        now: Date.now(),
        inactivityMs: (token.idleMs ?? getInactivityMs()) + SERVER_IDLE_GRACE_MS,
        currentUser: currentUser ? { activeSessionId: currentUser.activeSessionId } : null,
        tokenSignedInAt: token.signedInAt,
        maxAgeMs: getSessionMaxAgeMs(),
      });

      if (state.expired) {
        token.expired = true;
        token.expiredReason = state.reason;
        token.seesHidden = false;
        // So the notice can say when and where the other sign-in was, and the
        // person can tell it was them (another tab, phone, or a local copy).
        if (state.reason === "concurrent_session" && currentUser) {
          token.replacedBy = {
            at: currentUser.lastSignInAt ? new Date(currentUser.lastSignInAt).toISOString() : null,
            device: currentUser.lastSignInDevice ?? null,
            host: currentUser.lastSignInHost ?? null,
          };
        }
        return token;
      }

      token.expired = false;
      // Re-read every request, so a temporary password, or losing the Super
      // Administrator role, takes effect at once rather than at next sign-in.
      token.mustChangePassword = Boolean(currentUser?.mustChangePassword);
      // Re-read every request too, so turning two-step on lifts the block at once.
      token.mustSetUpTwoStep = needsTwoStepSetup(token.twoStepRequired, currentUser);
      token.seesHidden = await viewerMaySeeHidden(token.userId as string, currentUser?.employeeId);
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
        session.error =
          token.expiredReason === "concurrent_session" ? "ConcurrentSessionError" : token.expiredReason === "session_ended" ? "SessionEnded" : "SessionExpired";
        if (token.replacedBy) session.replacedBy = token.replacedBy;
        return session;
      }
      if (token.userId) session.user.id = token.userId as string;
      if (token.replacedSessionAt) session.replacedSessionAt = token.replacedSessionAt;
      if (token.mustChangePassword) session.mustChangePassword = true;
      if (token.mustSetUpTwoStep) session.mustSetUpTwoStep = true;
      return session;
    },
  },
};
