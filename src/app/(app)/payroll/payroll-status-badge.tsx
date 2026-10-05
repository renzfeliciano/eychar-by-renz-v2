import { cn } from "@/lib/utils";
import { PAYROLL_RUN_STATUS_LABELS, type PayrollRunStatus } from "@/domains/payroll/payroll-labels";

// Status as a dot plus a word: readable without color. Submitted is the
// one waiting on someone (approval), so it's the one that stands out.
const TONES: Record<PayrollRunStatus, string> = {
  draft: "text-muted-foreground [--dot:color-mix(in_oklch,var(--color-muted-foreground)_60%,transparent)]",
  submitted: "text-foreground [--dot:var(--color-warning)]",
  approved: "text-foreground [--dot:var(--color-primary)]",
  released: "text-foreground [--dot:var(--color-success)]",
  cancelled: "text-muted-foreground line-through decoration-muted-foreground/50 [--dot:var(--color-muted-foreground)]",
};

export function PayrollStatusBadge({ status, className }: { status: string; className?: string }) {
  const key = (status in TONES ? status : "draft") as PayrollRunStatus;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap", TONES[key], className)}>
      <span className="size-2 rounded-full bg-(--dot)" aria-hidden="true" />
      {PAYROLL_RUN_STATUS_LABELS[key]}
    </span>
  );
}
