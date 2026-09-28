// Copies MediaPipe's WASM runtime from node_modules into public/ so the
// self-service clock's face-liveness check (ADR-026) is served from this
// app's own origin — no third-party CDN at clock-in time, and nothing extra
// to allow in the CSP. Runs before `dev`/`build`; the output is gitignored
// (~23 MB of binaries that npm already versions for us via package-lock).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const target = join(root, "public", "mediapipe", "wasm");

// FilesetResolver picks SIMD or no-SIMD at runtime; the "module" variants
// are only for ES-module workers, which this app doesn't use.
const FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

mkdirSync(target, { recursive: true });
for (const file of FILES) copyFileSync(join(source, file), join(target, file));
console.log(`Copied ${FILES.length} MediaPipe WASM files to public/mediapipe/wasm`);
