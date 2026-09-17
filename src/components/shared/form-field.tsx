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

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="animate-in fade-in slide-in-from-top-1 text-sm text-destructive duration-200">
      {message}
    </p>
  );
}

/** Drop once near the top of any form/dialog that has at least one required field. */
export function RequiredFieldsHint() {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="text-destructive">*</span> Required field
    </p>
  );
}
