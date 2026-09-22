import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";

export function FormField({
  label,
  htmlFor,
  children,
  testId,
  required,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  testId?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}

/**
 * Renders as a self-contained alert card that hugs the right edge of
 * whatever flex-col form it sits in (via ml-auto) rather than a bare line
 * of red text — the message must be specific to what went wrong (never a
 * bare "Something went wrong"), since a card this visible makes a vague
 * message more noticeable, not less.
 */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="animate-in fade-in slide-in-from-top-2 ml-auto flex max-w-full items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-[var(--shadow-soft)] duration-300"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Drop once near the top of any form/dialog that has at least one required
 * field. Carries its own bottom margin (on top of the form's own gap-4
 * between fields) — without it, this note sits right against the first
 * field's label with no more room than any other two fields get, even
 * though it needs to read as a separate aside, not another field in the
 * stack. Standard spacing everywhere this is used, not a per-form tweak.
 */
export function RequiredFieldsHint() {
  return (
    <p className="mb-1 text-xs text-muted-foreground">
      <span className="text-destructive">*</span> Required field
    </p>
  );
}
