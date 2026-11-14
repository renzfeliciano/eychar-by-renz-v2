import { z } from "zod";
import { ValidationError } from "@/shared/errors";

/**
 * The details HR records at each stage of a complaint (the mockup's four cards).
 * The field set of a section is fixed here by stage code; a stage HR adds later,
 * and the first stage (whose details are the incident fields on the complaint
 * itself), get the generic fields. Pure: no database, tested directly.
 */

export type SectionField = {
  key: string;
  label: string;
  kind: "date" | "text" | "textarea" | "choice";
  options?: { value: string; label: string }[];
  maxLength?: number;
};

export type StageDetails = Record<string, string | Date | undefined>;

const TEXT_LIMIT = 1000;

const DATE: SectionField = { key: "date", label: "Date", kind: "date" };
const SENT_DATE: SectionField = { key: "sentDate", label: "Date sent by email", kind: "date" };
const REMARKS: SectionField = { key: "remarks", label: "Remarks", kind: "textarea", maxLength: TEXT_LIMIT };

const HEARING_MODES = [
  { value: "face_to_face", label: "Face to face" },
  { value: "virtual", label: "Virtual" },
];

const SECTIONS: Record<string, SectionField[]> = {
  nte_scheduled: [DATE, { key: "violations", label: "Violations (based on the company code of conduct)", kind: "textarea", maxLength: TEXT_LIMIT }, SENT_DATE, REMARKS],
  administrative_hearing: [
    DATE,
    { key: "hearingDate", label: "Possible date of hearing", kind: "date" },
    { key: "mode", label: "Hearing mode", kind: "choice", options: HEARING_MODES },
    SENT_DATE,
    REMARKS,
  ],
  sanction: [DATE, { key: "sanction", label: "Sanction on the violations (based on the company code of conduct)", kind: "textarea", maxLength: TEXT_LIMIT }, SENT_DATE, REMARKS],
};

const GENERIC: SectionField[] = [DATE, SENT_DATE, REMARKS];

export function sectionFields(stageCode: string): SectionField[] {
  return Object.hasOwn(SECTIONS, stageCode) ? SECTIONS[stageCode] : GENERIC;
}

const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

function fieldSchema(field: SectionField): z.ZodType {
  if (field.kind === "date") return z.preprocess(blankToUndefined, z.coerce.date().optional());
  if (field.kind === "choice") return z.preprocess(blankToUndefined, z.enum((field.options ?? []).map((option) => option.value) as [string, ...string[]]).optional());
  return z.preprocess(blankToUndefined, z.string().trim().max(field.maxLength ?? TEXT_LIMIT).optional());
}

/** Validates one section for a stage and returns only the fields that have a value. Throws `ValidationError` otherwise. */
export function parseStageDetails(stageCode: string, raw: unknown): StageDetails {
  const shape = Object.fromEntries(sectionFields(stageCode).map((field) => [field.key, fieldSchema(field)]));
  const result = z.object(shape).strict().safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
    throw new ValidationError(`Invalid stage details${where}: ${issue?.message ?? "check the values"}`);
  }
  return Object.fromEntries(Object.entries(result.data as Record<string, unknown>).filter(([, value]) => value !== undefined)) as StageDetails;
}

export function hasSectionData(details: StageDetails | null | undefined): boolean {
  return Boolean(details) && Object.values(details as StageDetails).some((value) => value !== undefined && value !== "");
}

function formatDay(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** One line for a card footer: the hearing date (or else the section date), plus the hearing mode. Empty with no date. */
export function summarizeSection(stageCode: string, details: StageDetails | null | undefined): string {
  if (!details) return "";
  const when = details.hearingDate ?? details.date;
  if (!when) return "";
  const modeLabel = HEARING_MODES.find((mode) => mode.value === details.mode)?.label;
  return [formatDay(when), stageCode === "administrative_hearing" ? modeLabel : undefined].filter(Boolean).join(" · ");
}

/** Stored sections as plain strings for the browser (dates as ISO text). Sections with no data are left out; undefined when none remain. */
export function serializeStageDetails(raw: unknown): Record<string, Record<string, string>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, Record<string, string>> = {};
  for (const [code, section] of Object.entries(raw as Record<string, StageDetails>)) {
    if (!hasSectionData(section)) continue;
    out[code] = Object.fromEntries(
      Object.entries(section)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : String(value)]),
    );
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
