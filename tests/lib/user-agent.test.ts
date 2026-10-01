import { describe, it, expect } from "vitest";
import { describeDevice, readHeader } from "@/lib/user-agent";

describe("describeDevice", () => {
  it("names common browsers and systems", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0")).toBe("Edge on Windows");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0")).toBe("Firefox on Mac");
  });

  it("falls back gracefully", () => {
    expect(describeDevice(undefined)).toBe("an unknown device");
    expect(describeDevice("curl/8.5.0")).toBe("an unknown device");
  });
});

describe("readHeader", () => {
  it("reads Node-style and Fetch-style headers", () => {
    expect(readHeader({ host: "localhost:4100" }, "host")).toBe("localhost:4100");
    expect(readHeader({ host: ["a", "b"] }, "host")).toBe("a");
    expect(readHeader(new Headers({ host: "eychar.example" }), "host")).toBe("eychar.example");
    expect(readHeader(undefined, "host")).toBeUndefined();
  });
});
