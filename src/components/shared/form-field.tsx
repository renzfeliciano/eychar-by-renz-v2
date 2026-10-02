import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";

type ControlProps = { id?: string; "aria-invalid"?: boolean | "true" | "false"; "aria-describedby"?: string; children?: ReactNode };

/**
 * The element inside a FormField that is the actual control: the one whose
 * id the label points at (an Input, or the SelectTrigger inside a Select),
 * else the only child element. Searched through statically-passed children
 * so wrappers (a Select root, a relative div with an icon) still work.
 */
function findControlPath(node: ReactNode, htmlFor: string | undefined): number[] | null {
  const items = Children.toArray(node);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!isValidElement<ControlProps>(item)) continue;
    if (htmlFor && item.props.id === htmlFor) return [index];
    const inner = findControlPath(item.props.children, htmlFor);
    if (inner) return [index, ...inner];
  }
  return null;
}

function wireControl(node: ReactNode, path: number[], extra: { invalid: boolean; describedBy: string }): ReactNode {
  const items = Children.toArray(node);
  const [head, ...rest] = path;
  return items.map((item, index) => {
    if (index !== head || !isValidElement<ControlProps>(item)) return item;
    if (rest.length > 0) return cloneElement(item, { children: wireControl(item.props.children, rest, extra) });
    const describedBy = [item.props["aria-describedby"], extra.describedBy].filter(Boolean).join(" ") || undefined;
    return cloneElement(item as ReactElement<ControlProps>, {
      "aria-describedby": describedBy,
      ...(extra.invalid ? { "aria-invalid": true } : {}),
    });
  });
}

/**
 * A labelled form control with an optional hint (`description`) and a
 * field-level `error` shown under it. Both get ids that are wired onto the
 * control as `aria-describedby`, and an error also sets `aria-invalid`
 * (which the Input/Select/Textarea styles turn red) — so a screen reader
 * hears "First name, invalid, First name is required" on focus. Use
 * `useFieldErrors` (src/lib/field-errors.ts) to route an API `{ error, field }`
 * here; FormError stays for errors that aren't about one field.
 */
export function FormField({
  label,
  htmlFor,
  children,
  testId,
  required,
  description,
  error,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  testId?: string;
  required?: boolean;
  /** A short hint under the control (format, what it's used for). */
  description?: string;
  /** This field's validation error, shown under the control. */
  error?: string | null;
}) {
  const generatedId = useId();
  const baseId = htmlFor ?? `field${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const descriptionId = description ? `${baseId}-description` : null;
  const errorId = error ? `${baseId}-error` : null;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ");

  let control: ReactNode = children;
  if (describedBy) {
    const path = findControlPath(children, htmlFor) ?? (Children.count(children) === 1 && isValidElement(children) ? [0] : null);
    if (path) control = wireControl(children, path, { invalid: Boolean(error), describedBy });
  }

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
      {control}
      {description && (
        <p id={descriptionId!} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId!} className="flex items-start gap-1.5 text-xs font-medium text-destructive" data-testid={testId ? `${testId}-error` : undefined}>
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
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
