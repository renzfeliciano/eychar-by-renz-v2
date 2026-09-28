"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label }: { label: string }) {
  return (
    <Button size="sm" onClick={() => window.print()} data-testid="payslips-print-button">
      <Printer className="size-3.5" />
      {label}
    </Button>
  );
}
