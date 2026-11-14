// The year-end run's three exports (payroll plan Phase 4, Gate C): the withholding reconciliation, the
// Form 2316 data and the BIR Annex F list of employees qualified for substituted filing. Field list as
// approved at Gate C; box numbers and Annex F columns [verify against the current BIR forms].
import ExcelJS from "exceljs";
import { Types } from "mongoose";
import { EmployeeModel, OrganizationModel, PayrollRecordModel, PayrollRuleVersionModel, PersonModel } from "@/server/db/models";
import { buildCsvContent } from "@/lib/csv";
import { BRAND } from "@/lib/brand";
import { dateToDateKey } from "@/lib/date-key";
import { NotFoundError } from "@/shared/errors";
import { sumMoney } from "./engine/money";
import { annualizeEmployeeYear, employeeYears, yearEndRulesOf, type YearEndRules } from "./year-end-data";

export const YEAR_END_REPORTS = ["reconciliation", "form-2316", "annex-f"] as const;
export type YearEndReport = (typeof YEAR_END_REPORTS)[number];
export const YEAR_END_REPORT_LABELS: Record<YearEndReport, string> = {
  reconciliation: "Year-end tax reconciliation",
  "form-2316": "Form 2316 data",
  "annex-f": "Substituted filing list (Annex F)",
};

type PreviousEmployer = { name: string; tin?: string | null; address?: string | null; zipCode?: string | null; concurrent: boolean };

export type YearEndRow = {
  employeeNumber: string;
  lastName: string;
  firstName: string;
  middleName: string;
  tin: string;
  rdoCode: string;
  address: string;
  zipCode: string;
  birthDate: string;
  phone: string;
  minimumWageEarner: boolean;
  periodFrom: string;
  periodTo: string;
  boxes: Record<string, number>;
  nonTaxableTotal: number;
  taxableTotal: number;
  gross: number;
  benefitsExcess: number;
  previousTaxable: number;
  grossTaxable: number;
  taxDue: number;
  presentWithheld: number;
  previousWithheld: number;
  /** Positive: collected in this run; negative: refunded. 0 for employees not in the run. */
  difference: number;
  inRun: boolean;
  note: string;
  previousEmployers: PreviousEmployer[];
};

export type YearEndReportData = {
  year: number;
  employer: { tin: string; name: string; address: string; zipCode: string; rdoCode: string };
  rules: YearEndRules;
  rows: YearEndRow[];
};

/**
 * Everyone with pay in the run's year and scope: the run's records (annualized, with the adjustment)
 * and the employees it leaves out (separated during the year), computed live from the same data with no
 * adjustment, because their annualization belongs to the final pay.
 */
export async function yearEndReportData(run: { _id: Types.ObjectId; organizationId: Types.ObjectId; ruleVersionId: Types.ObjectId; payPeriodStart: Date; exclusions?: { employeeId: Types.ObjectId; reason: string }[] | null }): Promise<YearEndReportData> {
  const year = run.payPeriodStart.getUTCFullYear();
  const [version, organization, records] = await Promise.all([
    PayrollRuleVersionModel.findById(run.ruleVersionId).lean(),
    OrganizationModel.findById(run.organizationId).select("name tax").lean(),
    PayrollRecordModel.find({ payrollRunId: run._id }).select("employeeId employeeNumber yearEnd").lean(),
  ]);
  const rules = version ? yearEndRulesOf(version as Parameters<typeof yearEndRulesOf>[0]) : null;
  if (!rules) throw new NotFoundError("This run's rule version has no year-end data");

  const excluded = (run.exclusions ?? []).map((exclusion) => exclusion.employeeId);
  const allIds = [...records.map((record) => record.employeeId), ...excluded];
  const [employees, years] = await Promise.all([
    EmployeeModel.find({ _id: { $in: allIds } }).select("personId employeeNumber").lean(),
    employeeYears(run.organizationId, year, allIds),
  ]);
  const people = new Map(
    (await PersonModel.find({ _id: { $in: employees.map((employee) => employee.personId) } }).select("firstName middleName lastName tinNumber rdoCode address zipCode birthDate phone").lean()).map((person) => [person._id.toString(), person]),
  );
  const employeeById = new Map(employees.map((employee) => [employee._id.toString(), employee]));

  const identity = (employeeId: string) => {
    const employee = employeeById.get(employeeId);
    const person = employee ? people.get(employee.personId.toString()) : undefined;
    return {
      employeeNumber: employee?.employeeNumber ?? "",
      lastName: person?.lastName ?? "",
      firstName: person?.firstName ?? "",
      middleName: person?.middleName ?? "",
      tin: person?.tinNumber ?? "",
      rdoCode: person?.rdoCode ?? "",
      address: person?.address ?? "",
      zipCode: person?.zipCode ?? "",
      birthDate: person?.birthDate ? dateToDateKey(person.birthDate) : "",
      phone: person?.phone ?? "",
    };
  };

  const rows: YearEndRow[] = [];
  for (const record of records) {
    const employeeId = record.employeeId.toString();
    const snapshot = record.yearEnd!;
    rows.push({
      ...identity(employeeId),
      minimumWageEarner: !!snapshot.minimumWageEarner,
      periodFrom: snapshot.periodFrom ?? "",
      periodTo: snapshot.periodTo ?? "",
      boxes: Object.fromEntries(snapshot.boxes.map((box: { box: string; amount: number }) => [box.box, box.amount])),
      nonTaxableTotal: snapshot.nonTaxableTotal,
      taxableTotal: snapshot.taxableTotal,
      gross: snapshot.gross,
      benefitsExcess: snapshot.benefitsExcess,
      previousTaxable: snapshot.previousTaxable,
      grossTaxable: snapshot.grossTaxable,
      taxDue: snapshot.taxDue,
      presentWithheld: snapshot.presentWithheld,
      previousWithheld: snapshot.previousWithheld,
      difference: snapshot.difference,
      inRun: true,
      note: "",
      previousEmployers: years.get(employeeId)?.previous.employers ?? [],
    });
  }
  for (const exclusion of run.exclusions ?? []) {
    const employeeId = exclusion.employeeId.toString();
    const own = years.get(employeeId);
    if (!own) continue;
    const { amounts, annualization } = annualizeEmployeeYear(own, rules);
    rows.push({
      ...identity(employeeId),
      minimumWageEarner: own.minimumWageEarner,
      periodFrom: own.periodFrom,
      periodTo: own.periodTo,
      boxes: amounts.boxes,
      nonTaxableTotal: amounts.nonTaxableTotal,
      taxableTotal: amounts.taxableTotal,
      gross: amounts.gross,
      benefitsExcess: amounts.benefitsExcess,
      previousTaxable: annualization.previousTaxable,
      grossTaxable: annualization.grossTaxable,
      taxDue: annualization.taxDue,
      presentWithheld: annualization.presentWithheld,
      previousWithheld: annualization.previousWithheld,
      difference: 0,
      inRun: false,
      note: exclusion.reason,
      previousEmployers: own.previous.employers,
    });
  }
  rows.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));

  const tax = (organization as { tax?: Record<string, string | undefined> } | null)?.tax ?? {};
  return {
    year,
    employer: { tin: tax.tin ?? "", name: tax.registeredName || organization?.name || "", address: tax.registeredAddress ?? "", zipCode: tax.zipCode ?? "", rdoCode: tax.rdoCode ?? "" },
    rules,
    rows,
  };
}

/** Why an employee isn't on Annex F, or null when they qualify (Gate C: one employer, on the year-end run, tax settled). */
export function notQualifiedForSubstitutedFiling(row: YearEndRow): string | null {
  if (!row.inRun) return row.note || "Not on the year-end run";
  if (row.previousEmployers.length) return "Had two or more employers in the year";
  return null;
}

type Table = { title: string; subtitle: string; headers: string[]; rows: (string | number)[][]; moneyFrom: number };

const yesNo = (value: boolean) => (value ? "Yes" : "No");
const action = (row: YearEndRow) => (!row.inRun ? "In final pay" : row.difference > 0 ? "Collect" : row.difference < 0 ? "Refund" : "None");

export function yearEndTable(report: YearEndReport, data: YearEndReportData, context: { organizationName: string; runNumber: string; statusLabel: string }): Table {
  const subtitle = `${context.runNumber} · ${context.statusLabel} · ${data.rows.length} employee${data.rows.length === 1 ? "" : "s"}`;
  if (report === "reconciliation") {
    const headers = ["Employee no.", "Employee", "Action", "Note", "Taxable, this employer", "Taxable, previous employer", "Gross taxable", "Tax due", "Withheld, this employer", "Withheld, previous employer", "To collect (+) / refund (−)", "Benefits over the exempt limit"];
    const rows = data.rows.map((row) => [row.employeeNumber, `${row.lastName}, ${row.firstName}`, action(row), row.note, row.taxableTotal, row.previousTaxable, row.grossTaxable, row.taxDue, row.presentWithheld, row.previousWithheld, row.difference, row.benefitsExcess]);
    return { title: `${context.organizationName}: year-end tax ${data.year}`, subtitle, headers, rows, moneyFrom: 4 };
  }
  if (report === "annex-f") {
    const qualified = data.rows.filter((row) => notQualifiedForSubstitutedFiling(row) === null);
    return {
      title: `${data.employer.name}: employees qualified for substituted filing, ${data.year}`,
      subtitle: `Employer TIN ${data.employer.tin || "(not recorded)"} · ${subtitle}`,
      headers: ["No.", "TIN", "Last name", "First name", "Middle name"],
      rows: qualified.map((row, index) => [index + 1, row.tin, row.lastName, row.firstName, row.middleName]),
      moneyFrom: 99,
    };
  }

  // Form 2316 data: one row per employee, columns in the form's order (Gate C field list).
  const boxes = data.rules.form2316Boxes;
  const nonTaxable = boxes.filter((box) => box.part === "non_taxable");
  const taxable = boxes.filter((box) => box.part === "taxable");
  const identityHeaders = [
    "1 Year", "2 Period from", "2 Period to", "3 TIN", "4 Last name", "4 First name", "4 Middle name", "5 RDO code", "6 Registered address", "6A ZIP code", "7 Date of birth", "8 Contact number", "11 Minimum wage earner",
    "12 Employer TIN", "13 Employer name", "14 Employer address", "14A Employer ZIP code", "15 Employer type",
    "16 Previous employer TIN", "17 Previous employer name", "18 Previous employer address", "18A Previous employer ZIP code", "Other previous employers",
    "Note",
  ];
  const summaryHeaders = ["19 Gross compensation", "20 Non-taxable", "21 Taxable, present", "22 Taxable, previous", "23 Gross taxable", "24 Tax due", "25A Withheld, present (as adjusted)", "25B Withheld, previous", "26 Total withheld", "27 PERA tax credit", "28 Total taxes withheld"];
  const detailHeaders = [...nonTaxable.map((box) => `${box.box} ${box.label}`), "38 Total non-taxable", ...taxable.map((box) => `${box.box} ${box.label}`), "52 Total taxable"];
  const rows = data.rows.map((row) => {
    const [first, ...others] = row.previousEmployers;
    const presentAdjusted = sumMoney([row.presentWithheld, row.difference]);
    const totalWithheld = sumMoney([presentAdjusted, row.previousWithheld]);
    return [
      data.year, row.periodFrom, row.periodTo, row.tin, row.lastName, row.firstName, row.middleName, row.rdoCode, row.address, row.zipCode, row.birthDate, row.phone, yesNo(row.minimumWageEarner),
      data.employer.tin, data.employer.name, data.employer.address, data.employer.zipCode, row.previousEmployers.some((employer) => employer.concurrent) ? "Secondary" : "Main",
      first?.tin ?? "", first?.name ?? "", first?.address ?? "", first?.zipCode ?? "", others.map((employer) => employer.name).join("; "),
      row.note,
      row.gross, row.nonTaxableTotal, row.taxableTotal, row.previousTaxable, row.grossTaxable, row.taxDue, presentAdjusted, row.previousWithheld, totalWithheld, 0, totalWithheld,
      ...nonTaxable.map((box) => row.boxes[box.box] ?? 0), row.nonTaxableTotal, ...taxable.map((box) => row.boxes[box.box] ?? 0), row.taxableTotal,
    ];
  });
  return { title: `${context.organizationName}: Form 2316 data ${data.year}`, subtitle, headers: [...identityHeaders, ...summaryHeaders, ...detailHeaders], rows, moneyFrom: identityHeaders.length };
}

export function yearEndCsv(table: Table): string {
  return buildCsvContent(table.headers, table.rows);
}

export function yearEndWorkbook(table: Table, sheetName: string): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BRAND.fullName;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), { views: [{ state: "frozen", ySplit: 4 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  sheet.getCell(1, 1).value = table.title;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.getCell(2, 1).value = table.subtitle;
  sheet.getCell(2, 1).font = { color: { argb: "FF6B7280" } };
  sheet.getRow(4).values = table.headers;
  sheet.getRow(4).font = { bold: true };
  table.rows.forEach((values, index) => (sheet.getRow(5 + index).values = values));
  table.headers.forEach((_, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = index >= table.moneyFrom ? 16 : 18;
    if (index >= table.moneyFrom) column.numFmt = "#,##0.00";
  });
  return workbook;
}
