import { decode } from "next-auth/jwt";

const COOKIE_NAMES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

/**
 * Whether the person behind this request may see records hidden as test data:
 * the Super Administrator, and a self-service user (who only ever reads
 * their own records, so a hidden test employee can still clock in).
 * Read from the session cookie's signed token (set by the jwt callback):
 * no database round-trip per query. Outside a request (daily jobs, scripts,
 * tests) nobody sees hidden records.
 */
export async function viewerSeesHidden(): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    for (const name of COOKIE_NAMES) {
      // next-auth splits large tokens into name.0, name.1, …
      const whole = store.get(name)?.value;
      const chunks = whole ? [whole] : store.getAll().filter((cookie) => cookie.name.startsWith(`${name}.`)).sort((a, b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop())).map((cookie) => cookie.value);
      if (!chunks.length) continue;
      const token = await decode({ token: chunks.join(""), secret: process.env.NEXTAUTH_SECRET ?? "" });
      return Boolean(token?.seesHidden);
    }
    return false;
  } catch {
    return false;
  }
}
