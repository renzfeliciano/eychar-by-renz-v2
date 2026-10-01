import { describe, it, expect } from "vitest";
import { buildContentSecurityPolicy, createNonce } from "@/server/security/csp";

describe("page Content-Security-Policy", () => {
  it("allows only scripts carrying this request's nonce (no 'unsafe-inline' scripts)", () => {
    const policy = buildContentSecurityPolicy("abc123");
    const scriptSrc = policy.split("; ").find((directive) => directive.startsWith("script-src"))!;
    expect(scriptSrc).toContain("'nonce-abc123'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
  });

  it("makes a fresh, unguessable nonce each time", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(nonces.size).toBe(50);
    expect([...nonces][0]).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
