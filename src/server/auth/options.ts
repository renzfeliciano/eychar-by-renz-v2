import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare, hashSync } from "bcryptjs";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel } from "@/server/db/models";
import { checkLoginRateLimit } from "./rate-limit";

// Computed once per process: compare() must run with the same cost whether
// the account exists or not, so response timing can't be used to enumerate
// valid emails (bcrypt is deliberately slow, and was previously only
// invoked when a matching user was found).
const DUMMY_PASSWORD_HASH = hashSync("not-a-real-password", 10);

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
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const ip = req?.headers?.["x-forwarded-for"] ?? "unknown";
        if (!checkLoginRateLimit(`login:${ip}`)) return null;

        // Explicit typeof checks — credentials come straight off the
        // request body, and a crafted payload like { email: { $ne: null } }
        // is truthy but would otherwise reach the Mongo query below as an
        // object instead of a string (NoSQL operator-injection).
        if (
          typeof credentials?.email !== "string" ||
          typeof credentials.password !== "string" ||
          !credentials.email ||
          !credentials.password
        ) {
          return null;
        }

        await connectMongoDB();

        const email = credentials.email.trim().toLowerCase();
        const user = await UserModel.findOne({ email, status: "active" }).lean();

        const passwordMatches = await compare(
          credentials.password,
          user?.passwordHash ?? DUMMY_PASSWORD_HASH,
        );
        if (!user || !passwordMatches) return null;

        return { id: user._id.toString(), email: user.email };
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
