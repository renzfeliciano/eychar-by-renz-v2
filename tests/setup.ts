import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// The two-factor secret box derives its key from this when MFA_ENCRYPTION_KEY
// isn't set; tests never read the real .env.
process.env.NEXTAUTH_SECRET ??= "test-only-nextauth-secret";

// Without this, each render() in a component test file leaves its DOM tree
// mounted for the next test in the same file.
afterEach(() => {
  cleanup();
});
