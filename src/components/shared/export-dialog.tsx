"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Loader2, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ExportFormat = "xlsx" | "csv";

/** A server-built file is a plain GET link; a browser-built one runs `build`. */
export type ExportTarget = { href: string } | { build: () => Promise<void> };

const FORMATS: { format: ExportFormat; icon: LucideIcon; label: string; detail: string }[] = [
  { format: "xlsx", icon: FileSpreadsheet, label: "Excel", detail: "Formatted sheet: title, filters, frozen header, print-ready" },
  { format: "csv", icon: FileText, label: "CSV", detail: "Plain rows, for importing into other systems" },
];

/**
 * The one export pattern across modules: an "Export" button opening a
 * dialog that offers the same data as a formatted Excel file or as CSV.
 * `children` carries anything format-independent (a date range, a summary
 * of what's included); `blocked` disables both formats while it's invalid.
 */
export function ExportDialog({
  title,
  description,
  testIdPrefix,
  targets,
  disabled = false,
  blocked = false,
  onOpen,
  children,
}: {
  title: string;
  description: string;
  testIdPrefix: string;
  targets: Record<ExportFormat, ExportTarget>;
  disabled?: boolean;
  blocked?: boolean;
  onOpen?: () => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [building, setBuilding] = useState<ExportFormat | null>(null);

  async function run(format: ExportFormat, build: () => Promise<void>) {
    setBuilding(format);
    try {
      await build();
      setOpen(false);
    } catch {
      toast.error("Couldn't prepare the file. Please try again.");
    } finally {
      setBuilding(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen?.();
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} disabled={disabled} data-testid={`${testIdPrefix}-button`}>
        <Download className="size-3.5" />
        Export
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {children}

          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Choose a format">
            {FORMATS.map(({ format, icon: Icon, label, detail }) => {
              const target = targets[format];
              const isBuilding = building === format;
              const inactive = blocked || (building !== null && !isBuilding);
              const className = cn(
                "group flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-[border-color,background-color,scale] duration-150 ease-out",
                "hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none active:scale-[0.98]",
                inactive && "pointer-events-none opacity-50",
              );
              const content = (
                <>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {isBuilding ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" /> : <Icon className="size-4 text-primary" aria-hidden="true" />}
                    {isBuilding ? "Preparing…" : label}
                  </span>
                  <span className="text-xs text-muted-foreground">{detail}</span>
                </>
              );
              const testId = `${testIdPrefix}-${format}`;

              if ("href" in target) {
                return (
                  <a key={format} href={blocked ? undefined : target.href} aria-disabled={blocked} className={className} data-testid={testId}>
                    {content}
                  </a>
                );
              }
              return (
                <button key={format} type="button" disabled={inactive || isBuilding} onClick={() => run(format, target.build)} className={className} data-testid={testId}>
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
