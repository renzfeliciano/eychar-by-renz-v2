"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/** Every toast stays this long (the countdown bar in globals.css runs for the same time). */
export const TOAST_DURATION_MS = 6000

/** Clears the 64px top bar (plus a 12px gap), so toasts never cover the account menu. */
export const TOAST_TOP_OFFSET = 76

/**
 * House toast style ("clean card"): a popover-surface card with a small icon
 * in the type's color, a bold title with an optional detail line, an
 * optional action such as Undo, a close button and a hairline countdown.
 * Colors come from the theme's success / primary / warning / destructive
 * tokens, which have their own brighter dark-mode values, so every type
 * stays visible in both themes. Styling lives in globals.css under `.app-toast`.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      offset={{ top: TOAST_TOP_OFFSET, right: 24 }}
      mobileOffset={{ top: TOAST_TOP_OFFSET, left: 16, right: 16 }}
      duration={TOAST_DURATION_MS}
      closeButton
      gap={10}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" strokeWidth={2.2} />,
        info: <InfoIcon className="size-4" strokeWidth={2.2} />,
        warning: <TriangleAlertIcon className="size-4" strokeWidth={2.2} />,
        error: <OctagonXIcon className="size-4" strokeWidth={2.2} />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "app-toast",
          title: "app-toast-title",
          description: "app-toast-description",
          icon: "app-toast-icon",
          closeButton: "app-toast-close",
          actionButton: "app-toast-action",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
