import { cn } from "@/lib/utils";
import { PAYROLL_RUN_STATUS_LABELS, type PayrollRunStatus } from "@/domains/payroll/payroll-labels";

// Status as a dot plus a word: readable without color. Submitted is the
// one waiting on someone (approval), so it's the one that stands out.
const TONES: Record<PayrollRunStatus, string> = {
  draft: "border-border bg-muted text-muted-foreground [--dot:var(--color-muted-foreground)]",
  submitted: "border-warning/30 bg-warning/10 text-warning [--dot:var(--color-warning)]",
  approved: "border-primary/30 bg-primary/10 text-primary [--dot:var(--color-primary)]",
  released: "border-success/30 bg-success/10 text-success [--dot:var(--color-success)]",
  cancelled: "border-border bg-transparent text-muted-foreground line-through decoration-muted-foreground/50 [--dot:var(--color-muted-foreground)]",
};

export function PayrollStatusBadge({ status, className }: { status: string; className?: string }) {
  const key = (status in TONES ? status : "draft") as PayrollRunStatus;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[key], className)}>
      <span className="size-1.5 rounded-full bg-(--dot)" aria-hidden="true" />
      {PAYROLL_RUN_STATUS_LABELS[key]}
    </span>
  );
}
