import { cn } from "@/lib/utils";
import type { TravelOrderExportRow } from "./travel-order-export-actions";
import { BRAND } from "@/lib/brand";

const cellClass = "border border-[#c3c2b7] p-[7px_8px] text-left align-top text-[11px]";

/**
 * Hidden on screen, shown only by the browser's print stylesheet — same
 * letterhead-style report convention as Cases/People (ADR-018/019). Fixed
 * paper colors (not theme tokens) are intentional: a printed page should
 * look the same regardless of the viewer's light/dark theme.
 */
export function TravelOrderPrintReport({ rows }: { rows: TravelOrderExportRow[] }) {
  const generatedAt = new Date();

  return (
    <div className="hidden bg-white font-sans text-[#0b0b0b] print:block">
      <div className="mb-4.5 border-b-2 border-[#0b0b0b] pb-3">
        <h1 className="m-0 mb-1 text-xl">{BRAND.fullName} — Travel Orders Report</h1>
        <p className="m-0 my-0.5 text-[11px] text-[#52514e]">
          Generated {generatedAt.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })} ·{" "}
          {rows.length} travel order{rows.length === 1 ? "" : "s"}
        </p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>#</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Employees</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Start date</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>End date</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Remarks</th>
            <th className={cn(cellClass, "bg-[#f2f2ef] font-bold")}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td className={cellClass}>{index + 1}</td>
              <td className={cellClass}>{row.employees}</td>
              <td className={cellClass}>{row.startDate}</td>
              <td className={cellClass}>{row.endDate}</td>
              <td className={cellClass}>{row.remarks || "—"}</td>
              <td className={cellClass}>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
