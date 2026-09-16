import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import argon2 from "argon2";
import { findUserByLogin } from "@/domains/identity/user-lookup";
import { loginSchema } from "@/shared/validation/auth";
import { checkLoginRateLimit } from "./rate-limit";

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

        return { id: user._id.toString(), email: user.email, name: user.username };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      return session;
    },
  },
};
