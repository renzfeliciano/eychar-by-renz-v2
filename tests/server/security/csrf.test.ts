import { describe, it, expect } from "vitest";
import { checkRequestOrigin } from "@/server/security/csrf";

const base = { host: "hr.pcas.ph", allowedOrigins: [] as string[] };

describe("checkRequestOrigin", () => {
  it("lets reads through without checking", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(checkRequestOrigin({ ...base, method, pathname: "/api/employees", origin: "https://evil.example" })).toEqual({ ok: true });
    }
  });

  it("accepts a write from the app's own origin", () => {
    expect(checkRequestOrigin({ ...base, method: "POST", pathname: "/api/employees", origin: "https://hr.pcas.ph" })).toEqual({ ok: true });
    expect(checkRequestOrigin({ ...base, method: "PATCH", pathname: "/api/leave-requests/1", origin: null, referer: "https://hr.pcas.ph/leave" })).toEqual({ ok: true });
  });

  it("uses the forwarded host behind a proxy, and any configured app origin", () => {
    expect(checkRequestOrigin({ ...base, host: "internal:3000", forwardedHost: "hr.pcas.ph", method: "POST", pathname: "/api/x", origin: "https://hr.pcas.ph" })).toEqual({ ok: true });
    expect(checkRequestOrigin({ ...base, host: "internal:3000", allowedOrigins: ["https://hr.pcas.ph"], method: "DELETE", pathname: "/api/x", origin: "https://hr.pcas.ph" })).toEqual({ ok: true });
  });

  it("rejects a write from another site, or with no origin at all", () => {
    expect(checkRequestOrigin({ ...base, method: "POST", pathname: "/api/employees", origin: "https://evil.example" })).toMatchObject({ ok: false });
    expect(checkRequestOrigin({ ...base, method: "POST", pathname: "/api/employees", origin: "https://hr.pcas.ph.evil.example" })).toMatchObject({ ok: false });
    expect(checkRequestOrigin({ ...base, method: "PUT", pathname: "/api/employees/1", origin: null, referer: null })).toMatchObject({ ok: false });
    expect(checkRequestOrigin({ ...base, method: "POST", pathname: "/api/x", origin: "https://hr.pcas.ph", secFetchSite: "cross-site" })).toMatchObject({ ok: false });
  });

  it("leaves NextAuth's own routes and the secret-protected cron endpoint to their own checks", () => {
    expect(checkRequestOrigin({ ...base, method: "POST", pathname: "/api/auth/callback/credentials", origin: null })).toEqual({ ok: true });
    expect(checkRequestOrigin({ ...base, method: "POST", pathname: "/api/cron/payroll-schedules", origin: null })).toEqual({ ok: true });
  });
});
