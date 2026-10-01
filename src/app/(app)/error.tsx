"use client";

import { SectionError } from "@/components/shared/section-error";

// Errors in any HR page render inside the workspace frame, so navigation stays usable.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionError error={error} reset={reset} />;
}
