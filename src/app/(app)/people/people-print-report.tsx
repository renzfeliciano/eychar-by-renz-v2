import { cn } from "@/lib/utils";
import type { PeopleExportRow } from "./people-export-actions";
import { BRAND } from "@/lib/brand";
import { formatDateTime } from "@/lib/app-time";

const cellClass = "border border-[#c3c2b7] p-[7px_8px] text-left align-top text-[11px]";

/**
 * Hidden on screen, shown only by the browser's print stylesheet — a
 * compact, letterhead-style roster of every employee, matching the legacy
 * v1 app's Employee roster print report. Fixed paper colors (not theme
 * tokens) are intentional: a printed page should look the same regardless
 * of the viewer's light/dark theme.
 */
export function PeoplePrintReport({ rows }: { rows: PeopleExportRow[] }) {
  const generatedAt = new Date();

  return (
    <div className="hidden bg-white font-sans text-[#0b0b0b] print:block">
      <div className="mb-4.5 border-b-2 border-[#0b0b0b] pb-3">
        <h1 className="m-0 mb-1 text-xl">{BRAND.fullName} — Employee Roster</h1>
        <p className="m-0 my-0.5 text-[11px] text-[#52514e]">
          Generated {formatDateTime(generatedAt, "long")} ·{" "}
          {rows.length} employee{rows.length === 1 ? "" : "s"}
        </p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>#</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Employee number</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Employee name</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Position</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Project/site</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Employment status</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Age</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Length of service</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.employeeNumber}-${index}`}>
              <td className={cellClass}>{index + 1}</td>
              <td className={cellClass}>{row.employeeNumber || "—"}</td>
              <td className={cellClass}>{row.name}</td>
              <td className={cellClass}>{row.position}</td>
              <td className={cellClass}>{row.project}</td>
              <td className={cellClass}>{row.employmentStatus}</td>
              <td className={cellClass}>{row.age || "—"}</td>
              <td className={cellClass}>{row.lengthOfService}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
