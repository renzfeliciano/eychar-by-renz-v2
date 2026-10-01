// Session/token fields added by the account-security hardening (merged into
// the declarations in src/shared/types/next-auth.d.ts).
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    /** The account signed in with a temporary password and must replace it before anything else. */
    mustChangePassword?: boolean;
    /** Staff account whose organization requires two-step verification, not set up yet. */
    mustSetUpTwoStep?: boolean;
  }

  interface User {
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Re-read from the account on every request (src/server/auth/options.ts). */
    mustChangePassword?: boolean;
    /** The organization requires two-step for staff (refreshed with the idle limit). */
    twoStepRequired?: boolean;
    mustSetUpTwoStep?: boolean;
    /** When this session signed in (ms), for the absolute lifetime cap (SESSION_MAX_HOURS). */
    signedInAt?: number;
  }
}
