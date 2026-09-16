import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import argon2 from "argon2";
import { randomUUID } from "crypto";
import { findUserByLogin } from "@/domains/identity/user-lookup";
import { loginSchema } from "@/shared/validation/auth";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel } from "@/server/db/models";
import { checkLoginRateLimit } from "./rate-limit";
import { resolveSessionState } from "./session-policy";
import { getInactivityMs } from "./inactivity";

// Computed once per process: verify() must run with the same cost whether
// the account exists or not, so response timing can't be used to enumerate
// valid usernames/emails (argon2 is deliberately slow, and was previously
// only invoked when a matching user was found).
const dummyHashPromise = argon2.hash("not-a-real-password");

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  // JWT strategy: authentication (this file) stays fully separate from
  // authorization (src/server/authorization/authorize.ts), which is
  // re-resolved from RoleAssignment/Role on every request rather than
  // cached in the token (AGENTS.md §19).
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
  },

  pages: {
    signIn: "/login",
  },

  providers: [
    CredentialsProvider({
      name: "hris-workforcehub",
      credentials: {
        login: { label: "Username or email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const ip = req?.headers?.["x-forwarded-for"] ?? "unknown";
        if (!checkLoginRateLimit(`login:${ip}`)) return null;

        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await findUserByLogin(parsed.data.login);

        const passwordMatches = await argon2.verify(
          user?.passwordHash ?? (await dummyHashPromise),
          parsed.data.password,
        );
        if (!user || !passwordMatches) return null;

        // Single-active-session enforcement: this login supersedes any
        // other open session on this account (src/server/auth/session-policy.ts).
        const sessionId = randomUUID();
        await UserModel.updateOne(
          { _id: user._id },
          { $set: { activeSessionId: sessionId, lastActivityAt: new Date() } },
        );

        return { id: user._id.toString(), email: user.email, name: user.username, sessionId };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.sessionId = user.sessionId;
        token.lastActivityAt = Date.now();
        token.expired = false;
        return token;
      }

      if (!token.userId || !token.sessionId) return token;

      await connectMongoDB();
      const currentUser = await UserModel.findOne({ _id: token.userId, status: "active" })
        .select("activeSessionId")
        .lean();

      const state = resolveSessionState({
        tokenSessionId: token.sessionId,
        tokenLastActivityAt: token.lastActivityAt ?? 0,
        now: Date.now(),
        inactivityMs: getInactivityMs(),
        currentUser: currentUser ? { activeSessionId: currentUser.activeSessionId } : null,
      });

      if (state.expired) {
        token.expired = true;
        token.expiredReason = state.reason;
        return token;
      }

      token.expired = false;
      token.lastActivityAt = Date.now();
      return token;
    },

    async session({ session, token }) {
      if (token.expired) {
        session.error = token.expiredReason === "concurrent_session" ? "ConcurrentSessionError" : "SessionExpired";
        return session;
      }
      if (token.userId) session.user.id = token.userId as string;
      return session;
    },
  },
};
