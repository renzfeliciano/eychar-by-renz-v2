import type { Metadata } from "next";

// The sign-in page is a client component, so its document title lives here.
export const metadata: Metadata = { title: "Sign in" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
