import { describe, it, expect, vi, afterEach } from "vitest";
import { routeMediaPipeInfoLogs } from "@/lib/liveness/mediapipe-console";

describe("routeMediaPipeInfoLogs", () => {
  const originalError = console.error;
  const originalInfo = console.info;

  afterEach(() => {
    console.error = originalError;
    console.info = originalInfo;
  });

  it("sends MediaPipe's own INFO lines to console.info instead of console.error", () => {
    const error = vi.fn();
    const info = vi.fn();
    console.error = error;
    console.info = info;

    routeMediaPipeInfoLogs();
    console.error("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.");

    expect(info).toHaveBeenCalledWith("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.");
    expect(error).not.toHaveBeenCalled();
  });

  it("leaves every real error on console.error", () => {
    const error = vi.fn();
    console.error = error;

    routeMediaPipeInfoLogs();
    const failure = new Error("boom");
    console.error("Failed to load model", failure);
    console.error(failure);

    expect(error).toHaveBeenCalledWith("Failed to load model", failure);
    expect(error).toHaveBeenCalledWith(failure);
  });

  it("installs only once, so repeated face-check loads don't stack wrappers", () => {
    const error = vi.fn();
    console.error = error;

    routeMediaPipeInfoLogs();
    const wrapped = console.error;
    routeMediaPipeInfoLogs();

    expect(console.error).toBe(wrapped);
  });
});
