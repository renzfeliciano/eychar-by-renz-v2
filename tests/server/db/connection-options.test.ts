import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// connectMongoDB's options and production index policy, without a database.
const connect = vi.fn();
const init = vi.fn();
vi.mock("mongoose", () => ({ default: { connect: (...args: unknown[]) => connect(...args) } }));
vi.mock("@/server/db/models", () => ({ SomeModel: { init: () => init() } }));

async function freshConnect() {
  delete (globalThis as { mongooseCache?: unknown }).mongooseCache;
  vi.resetModules();
  const { connectMongoDB } = await import("@/server/db/connection");
  return connectMongoDB();
}

describe("connectMongoDB options", () => {
  const env = { ...process.env };
  const savedCache = (globalThis as { mongooseCache?: unknown }).mongooseCache;

  beforeEach(() => {
    connect.mockReset().mockResolvedValue({ fake: "connection" });
    init.mockReset().mockResolvedValue(undefined);
    process.env.MONGODB_URI = "mongodb://example.invalid/test";
  });

  afterEach(() => {
    process.env = { ...env };
    (globalThis as { mongooseCache?: unknown }).mongooseCache = savedCache;
  });

  it("keeps a small pool that releases idle connections, and builds indexes outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.MONGODB_MAX_POOL_SIZE;
    await freshConnect();
    expect(connect).toHaveBeenCalledWith("mongodb://example.invalid/test", expect.objectContaining({ maxPoolSize: 5, minPoolSize: 0, maxIdleTimeMS: 10_000 }));
    expect(connect.mock.calls[0][1]).not.toHaveProperty("autoIndex");
    expect(init).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it("takes the pool size from MONGODB_MAX_POOL_SIZE, ignoring nonsense", async () => {
    process.env.MONGODB_MAX_POOL_SIZE = "8";
    await freshConnect();
    expect(connect.mock.calls[0][1]).toMatchObject({ maxPoolSize: 8 });
    process.env.MONGODB_MAX_POOL_SIZE = "zero";
    await freshConnect();
    expect(connect.mock.calls[1][1]).toMatchObject({ maxPoolSize: 5 });
  });

  it("never builds indexes or collections at runtime in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await freshConnect();
    expect(connect.mock.calls[0][1]).toMatchObject({ autoIndex: false, autoCreate: false });
    expect(init).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
