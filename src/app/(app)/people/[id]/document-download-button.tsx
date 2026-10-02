"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DocumentDownloadButton({ employeeId, documentId, organizationId, fileName }: { employeeId: string; documentId: string; organizationId: string; fileName: string }) {
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownload() {
    setIsDownloading(true);
    try {
      // The route streams the file itself (from object storage or, for older documents, the database).
      const response = await fetch(`/api/employees/${employeeId}/documents/${documentId}?organizationId=${encodeURIComponent(organizationId)}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        toast.error(body.error ?? "Couldn't download the document.");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      // Give the browser a moment to start the download before releasing the file.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      toast.error("Couldn't download the document. Check your connection and try again.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={handleDownload} icon={Download} pending={isDownloading} aria-label={`Download ${fileName}`} />
  );
}
