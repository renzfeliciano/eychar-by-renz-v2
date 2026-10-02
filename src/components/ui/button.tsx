import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { Loader2, type LucideIcon } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Touch targets: below md every size grows to a thumb-friendly minimum
// (40px for default/icon/lg, 36px for sm, 32px for xs) via min-height/width,
// so desktop keeps its dense sizes and a className height override (h-11 on
// the sign-in button, size-7 on a dialog close) still wins where it's larger.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity,transform,translate,scale,rotate] duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[var(--shadow-soft)] hover:bg-[color-mix(in_oklch,var(--primary),black_8%)]",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 max-md:min-h-10 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 max-md:min-h-8 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 max-md:min-h-9 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 max-md:min-h-10 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8 max-md:min-h-10 max-md:min-w-10",
        "icon-xs":
          "size-6 max-md:min-h-8 max-md:min-w-8 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 max-md:min-h-9 max-md:min-w-9 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9 max-md:min-h-10 max-md:min-w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * House rule for every button with a label: an icon, then the word
 * ("[→] Sign in"). While it works (`pending`), a spinner takes the icon's
 * place, on the same side and at the same size, and the word becomes its
 * present participle (`pendingLabel`, "Signing in…"); the button disables
 * itself and tells screen readers it's busy. Pass `icon` and `pending`
 * instead of hand-placing <Loader2/> (tests/standards/button-standard.test.ts).
 */
function Button({
  className,
  variant = "default",
  size = "default",
  icon: Icon,
  pending = false,
  pendingLabel,
  children,
  disabled,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Shown before the label; replaced by the spinner while `pending`. */
    icon?: LucideIcon
    /** The action is running: spinner in the icon's place, disabled, aria-busy. */
    pending?: boolean
    /** The label while pending, in the "-ing" form ("Saving…"). Defaults to the normal label. */
    pendingLabel?: React.ReactNode
  }) {
  const showSlot = Boolean(Icon) || pending
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {showSlot &&
        (pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" data-icon="inline-start" data-testid="button-spinner" />
        ) : (
          Icon && <Icon aria-hidden="true" data-icon="inline-start" />
        ))}
      {pending && pendingLabel !== undefined ? pendingLabel : children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
