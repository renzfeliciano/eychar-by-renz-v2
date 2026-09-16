import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without this, each render() in a component test file leaves its DOM tree
// mounted for the next test in the same file.
afterEach(() => {
  cleanup();
});
