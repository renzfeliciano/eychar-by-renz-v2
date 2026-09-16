import { Label } from "@/components/ui/label";

export function FormField({
  label,
  htmlFor,
  children,
  testId,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <Label htmlFor={htmlFor}>{label}</Label>
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
