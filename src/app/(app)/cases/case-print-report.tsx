import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { CaseExportRow } from "./case-export-actions";
import { BRAND } from "@/lib/brand";
import { formatDateTime } from "@/lib/app-time";

const cellClass = "border border-[#c3c2b7] p-[7px_8px] text-left align-top text-[11px]";

/**
 * Hidden on screen, shown only by the browser's print stylesheet — a
 * compact, letterhead-style table of every case, matching the legacy v1
 * app's Case Monitoring print report. Fixed paper colors (not theme
 * tokens) are intentional: a printed page should look the same regardless
 * of the viewer's light/dark theme. Brief history runs long, so it gets
 * its own full-width sub-row under each case rather than a cramped extra
 * column.
 */
export function CasePrintReport({ rows }: { rows: CaseExportRow[] }) {
  const generatedAt = new Date();

  return (
    <div className="hidden bg-white font-sans text-[#0b0b0b] print:block">
      <div className="mb-4.5 border-b-2 border-[#0b0b0b] pb-3">
        <h1 className="m-0 mb-1 text-xl">{BRAND.fullName} — Case Monitoring Report</h1>
        <p className="m-0 my-0.5 text-[11px] text-[#52514e]">
          Generated {formatDateTime(generatedAt, "long")} ·{" "}
          {rows.length} case{rows.length === 1 ? "" : "s"}
        </p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>#</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Project</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Case name</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Case number</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Classification</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Status</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Legal counsel</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <Fragment key={`${row.caseNumber}-${index}`}>
              <tr>
                <td className={cellClass}>{index + 1}</td>
                <td className={cellClass}>{row.project}</td>
                <td className={cellClass}>{row.caseName}</td>
                <td className={cellClass}>{row.caseNumber}</td>
                <td className={cellClass}>{row.classification}</td>
                <td className={cellClass}>{row.status}</td>
                <td className={cellClass}>{row.legalCounsel || "—"}</td>
              </tr>
              <tr>
                <td colSpan={7} className={cn(cellClass, "border-t-0 bg-[#fafaf8] italic text-[#52514e]")}>
                  <span className="font-bold not-italic text-[#0b0b0b]">Brief history:</span> {row.briefHistory || "—"}
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
