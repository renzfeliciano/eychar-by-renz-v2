"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/** Every toast stays this long (the countdown bar in globals.css runs for the same time). */
export const TOAST_DURATION_MS = 6000

/**
 * House toast style: a popover-surface card with a colored accent bar on the
 * left, a tinted icon chip, a bold title with an optional detail line, a
 * close button and a countdown bar. Colors come from the theme's success /
 * primary / warning / destructive tokens, which have their own brighter
 * dark-mode values, so every type stays visible in both themes. Styling
 * lives in globals.css under `.app-toast`.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      duration={TOAST_DURATION_MS}
      closeButton
      gap={10}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
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
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
