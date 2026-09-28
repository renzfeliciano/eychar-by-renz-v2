import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildTableCsv, buildTableWorkbook, type TableExportSpec } from "@/lib/export/table-export";
import { exportFilename, filenameSlug } from "@/lib/export/filename";

type Row = { name: string; status: string; days: number | null };

const SPEC: TableExportSpec<Row> = {
  title: "Case monitoring",
  sheetName: "Cases",
  noun: ["case", "cases"],
  columns: [
    { header: "Case name", width: 30, value: (row) => row.name },
    { header: "Status", width: 14, value: (row) => row.status },
    { header: "Days open", width: 10, value: (row) => row.days },
  ],
};

const ROWS: Row[] = [
  { name: "Santos v. Acme", status: "Open", days: 12 },
  { name: 'The "Rufino" matter', status: "Closed", days: null },
];

describe("buildTableCsv", () => {
  it("numbers the rows and escapes values", () => {
    const lines = buildTableCsv(SPEC, ROWS).replace(/^﻿/, "").split("\n");
    expect(lines).toEqual(['"#","Case name","Status","Days open"', '"1","Santos v. Acme","Open","12"', '"2","The ""Rufino"" matter","Closed",""']);
  });
});

describe("buildTableWorkbook", () => {
  it("lays the rows out on the shared template: title, count, frozen filtered header", async () => {
    const workbook = await buildTableWorkbook(SPEC, ROWS, { organizationName: "Acme", generatedAt: new Date(2026, 8, 28, 14, 5) });
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
    const sheet = loaded.getWorksheet("Cases")!;

    expect(sheet.getCell("A1").value).toBe("Acme: Case monitoring");
    expect(sheet.getCell("A2").value).toBe("2 cases · generated September 28, 2026 at 2:05 PM");
    expect(sheet.getRow(4).values).toEqual([undefined, "#", "Case name", "Status", "Days open"]);
    expect(sheet.getRow(5).values).toEqual([undefined, 1, "Santos v. Acme", "Open", 12]);
    expect(sheet.getRow(6).values).toEqual([undefined, 2, 'The "Rufino" matter', "Closed"]);
    expect(sheet.getRow(4).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 4 });
    expect(sheet.autoFilter).toBe("A4:D4");
    expect(sheet.getColumn(2).width).toBe(30);
  });

  it("says so in words when there is exactly one record", async () => {
    const workbook = await buildTableWorkbook(SPEC, ROWS.slice(0, 1), { organizationName: "Acme", generatedAt: new Date(2026, 8, 28, 9, 0) });
    expect(workbook.getWorksheet("Cases")!.getCell("A2").value).toBe("1 case · generated September 28, 2026 at 9:00 AM");
  });
});

describe("export filenames", () => {
  it("names the file after the organization, the module and the day", () => {
    expect(filenameSlug("Project Concepts & Administrative Services, Inc.")).toBe("project-concepts-administrative-services-inc");
    expect(filenameSlug("***")).toBe("organization");
    expect(exportFilename("Acme Inc.", "case-monitoring", new Date(2026, 8, 28))).toBe("acme-inc-case-monitoring-2026-09-28");
  });
});
