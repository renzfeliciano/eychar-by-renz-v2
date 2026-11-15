import { describe, it, expect } from "vitest";
import { friendlyErrorMessage, OFFLINE_MESSAGE } from "@/lib/friendly-error";

describe("friendlyErrorMessage", () => {
  it("keeps a plain-language message that our own code wrote", () => {
    expect(friendlyErrorMessage(new Error("That employee already has a schedule."), "Failed.")).toBe("That employee already has a schedule.");
  });

  it("replaces browser network failures with a sentence a person can act on", () => {
    for (const raw of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "Network request failed"]) {
      expect(friendlyErrorMessage(new TypeError(raw), "Failed.")).toBe(OFFLINE_MESSAGE);
    }
  });

  it("never shows a parser error, such as an HTML error page read as JSON", () => {
    const parse = new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
    expect(friendlyErrorMessage(parse, "Couldn't save.")).toBe("Couldn't save.");
    expect(friendlyErrorMessage(new Error("JSON.parse: unexpected character"), "Couldn't save.")).toBe("Couldn't save.");
  });

  it("falls back for anything that isn't an Error or has no message", () => {
    expect(friendlyErrorMessage("boom", "Fallback.")).toBe("Fallback.");
    expect(friendlyErrorMessage(new Error("  "), "Fallback.")).toBe("Fallback.");
    expect(friendlyErrorMessage(new TypeError("x is not a function"), "Fallback.")).toBe("Fallback.");
  });
});
