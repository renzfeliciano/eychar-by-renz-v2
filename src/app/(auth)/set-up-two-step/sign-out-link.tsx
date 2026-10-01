"use client";

import { signOut } from "next-auth/react";

/** Lets someone without their phone at hand leave the set-up page instead of being stuck on it. */
export function SignOutLink({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="inline-flex items-center gap-1.5 rounded-sm font-medium text-foreground/80 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      {children}
    </button>
  );
}
