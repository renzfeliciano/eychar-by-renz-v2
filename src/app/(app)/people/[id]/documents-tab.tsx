import type { EmployeeDocumentService } from "@/domains/documents/employee-document-service";
import { documentExpiry } from "@/domains/workforce/profile-summary";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentFormDialog } from "./document-form-dialog";
import { DocumentDownloadButton } from "./document-download-button";
import { formatDate } from "./profile-format";

/** The Documents tab: files on record with their expiry, upload and edit. */
export function DocumentsTab({
  organizationId,
  employeeId,
  documents,
  documentTypeOptions,
  documentTypeNameByCode,
  canCreateDocuments,
  canUpdateDocuments,
  now,
}: {
  organizationId: string;
  employeeId: string;
  documents: Awaited<ReturnType<typeof EmployeeDocumentService.listForEmployee>>;
  documentTypeOptions: { id: string; label: string }[];
  documentTypeNameByCode: Map<string, string>;
  canCreateDocuments: boolean;
  canUpdateDocuments: boolean;
  now: Date;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Documents</CardTitle>
        <CardDescription>Contracts, IDs and certificates on file, with expiry dates</CardDescription>
        {canCreateDocuments && (
          <CardAction>
            <DocumentFormDialog organizationId={organizationId} employeeId={employeeId} documentTypes={documentTypeOptions} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <DataTable
          columns={[
            { key: "title", header: "Title", render: (document) => <span className="font-medium">{document.title}</span> },
            { key: "type", header: "Type", render: (document) => documentTypeNameByCode.get(document.documentType) ?? document.documentType },
            { key: "fileName", header: "File", render: (document) => <span className="text-muted-foreground">{document.fileName}</span> },
            {
              key: "expires",
              header: "Expires",
              render: (document) => {
                const state = documentExpiry(document.expiresAt, now);
                if (state === "none") return <span className="text-muted-foreground">No expiry</span>;
                return (
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    {formatDate(document.expiresAt)}
                    {state === "expired" && <StatusBadge status="expired" label="Expired" tone="danger" />}
                    {state === "expiring" && <StatusBadge status="expiring" label="Expiring soon" tone="warning" />}
                  </span>
                );
              },
            },
            { key: "uploaded", header: "Uploaded", render: (document) => formatDate(document.createdAt) },
            {
              key: "action",
              header: "",
              render: (document) => (
                <div className="flex items-center gap-1">
                  <DocumentDownloadButton employeeId={employeeId} documentId={document._id.toString()} organizationId={organizationId} fileName={document.fileName} />
                  {canUpdateDocuments && (
                    <DocumentFormDialog
                      organizationId={organizationId}
                      employeeId={employeeId}
                      documentTypes={documentTypeOptions}
                      initialValue={{
                        id: document._id.toString(),
                        title: document.title,
                        documentType: document.documentType,
                        fileName: document.fileName,
                        expiresAt: document.expiresAt?.toISOString(),
                        notes: document.notes,
                      }}
                    />
                  )}
                </div>
              ),
            },
          ]}
          rows={documents}
          getRowKey={(document) => document._id.toString()}
          emptyMessage="No documents uploaded yet."
          emptyDescription="Upload the employment contract, government IDs and certificates so they're in one place."
        />
      </CardContent>
    </Card>
  );
}
