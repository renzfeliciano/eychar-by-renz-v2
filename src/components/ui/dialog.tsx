"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        // A plain dim, matching the Sheet's scrim: it only has to push the
        // page back so the dialog reads as the one thing to act on — heavy
        // frosted glass here was decoration, not function.
        "fixed inset-0 isolate z-50 bg-black/25 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/** Flattens fragments so a header/footer passed inside <>…</> is still found. */
function flattenChildren(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((child) =>
    React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === React.Fragment
      ? flattenChildren(child.props.children)
      : [child]
  )
}

/**
 * House rule for every dialog: the header and footer stay put and only the
 * part between them scrolls. Children are sorted into header / body /
 * footer by type, so existing dialogs get it without any change: everything
 * that isn't a DialogHeader or DialogFooter goes in the scrolling body.
 */
function splitDialogChildren(children: React.ReactNode) {
  const header: React.ReactNode[] = []
  const body: React.ReactNode[] = []
  const footer: React.ReactNode[] = []
  for (const child of flattenChildren(children)) {
    const slot = React.isValidElement(child) ? dialogSlotOf(child.type) : null
    if (slot === "header") header.push(child)
    else if (slot === "footer") footer.push(child)
    else body.push(child)
  }
  return { header, body, footer }
}

/**
 * DialogHeader/DialogFooter, or a component of the caller's own that wraps
 * one and says so with a static `dialogSlot = "header" | "footer"`.
 */
function dialogSlotOf(type: unknown): "header" | "footer" | null {
  if (type === DialogHeader) return "header"
  if (type === DialogFooter) return "footer"
  const declared = (type as { dialogSlot?: unknown } | null)?.dialogSlot
  return declared === "header" || declared === "footer" ? declared : null
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  const { header, body, footer } = splitDialogChildren(children as React.ReactNode)
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-2xl bg-popover p-4 text-sm text-popover-foreground shadow-[var(--shadow-modal)] ring-1 ring-foreground/15 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {header}
        {body.length > 0 && (
          // -mx-4/px-4 keeps edge-to-edge children (lists with -mx-4) flush
          // while this box scrolls; it collapses when its contents render nothing.
          <div data-slot="dialog-body" className="-mx-4 flex min-h-0 flex-1 flex-col gap-[inherit] overflow-y-auto overscroll-contain px-4 empty:hidden">
            {body}
          </div>
        )}
        {footer}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3 z-10 size-7 rounded-full bg-black/[0.04] text-muted-foreground transition-[color,background-color,transform,translate,scale,rotate] duration-150 hover:scale-105 active:scale-[0.97] hover:bg-black/[0.08] hover:text-foreground dark:bg-white/10 dark:hover:bg-white/15"
                size="icon-sm"
              />
            }
          >
            <XIcon className="size-3.5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("-mx-4 flex shrink-0 flex-col gap-2 border-b px-4 pb-4", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // Dialogs are narrow by design (max-w-sm/md) — a viewport `sm:`
        // breakpoint doesn't reflect the dialog's own width, so this stays
        // row + right-aligned unconditionally rather than stacking based on
        // how wide the browser window happens to be.
        "-mx-4 -mb-4 flex shrink-0 flex-row justify-end gap-2 border-t bg-muted/50 p-4",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-lg leading-none font-semibold tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
