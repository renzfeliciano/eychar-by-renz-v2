"use client";

import { SectionError } from "@/components/shared/section-error";

// Errors in the employee portal stay inside its header, with a way back to clocking in.
export default function SelfServiceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionError error={error} reset={reset} homeHref="/clock" homeLabel="Back to clock-in" />;
}
