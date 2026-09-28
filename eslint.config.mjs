import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // public/mediapipe/wasm is vendored Emscripten output copied from node_modules.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "public/mediapipe/**"]),
]);

export default eslintConfig;
