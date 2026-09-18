"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DocumentDownloadButton({ employeeId, documentId, organizationId, fileName }: { employeeId: string; documentId: string; organizationId: string; fileName: string }) {
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownload() {
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/employees/${employeeId}/documents/${documentId}?organizationId=${organizationId}`);
      if (!response.ok) return;
      const { document } = await response.json();
      const link = window.document.createElement("a");
      link.href = `data:${document.fileType};base64,${document.fileData}`;
      link.download = document.fileName;
      link.click();
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={handleDownload} disabled={isDownloading} aria-label={`Download ${fileName}`}>
      {isDownloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
    </Button>
  );
}
