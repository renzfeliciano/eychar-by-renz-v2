const INSTALLED = Symbol.for("eychar.mediapipeInfoRouting");

type MarkedConsoleError = typeof console.error & { [INSTALLED]?: true };

/**
 * MediaPipe's WASM runtime prints its own informational lines (e.g.
 * "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.") through
 * console.error, so Next's dev overlay — and any error monitoring — reports
 * a healthy face check as a failure. This reroutes exactly those "INFO: "
 * lines to console.info; every other console.error call passes through
 * untouched. The marker keeps it to one wrapper however many times the face
 * model is loaded.
 */
export function routeMediaPipeInfoLogs(): void {
  const current = console.error as MarkedConsoleError;
  if (current[INSTALLED]) return;

  const routed: MarkedConsoleError = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO: ")) {
      console.info(...args);
      return;
    }
    current(...args);
  };
  routed[INSTALLED] = true;
  console.error = routed;
}
