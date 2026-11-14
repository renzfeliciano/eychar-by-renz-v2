import { describe, it, expect } from "vitest";
import { sectionFields, parseStageDetails, hasSectionData, summarizeSection, serializeStageDetails } from "@/domains/complaints/stage-sections";
import { ValidationError } from "@/shared/errors";

const keys = (code: string) => sectionFields(code).map((field) => field.key);

describe("sectionFields", () => {
  it("gives each known stage its own fields, from the mockup", () => {
    expect(keys("nte_scheduled")).toEqual(["date", "violations", "sentDate", "remarks"]);
    expect(keys("administrative_hearing")).toEqual(["date", "hearingDate", "mode", "sentDate", "remarks"]);
    expect(keys("sanction")).toEqual(["date", "sanction", "sentDate", "remarks"]);
  });

  it("gives any other stage, including the first one, the generic fields", () => {
    expect(keys("received")).toEqual(["date", "sentDate", "remarks"]);
    expect(keys("something_hr_added")).toEqual(["date", "sentDate", "remarks"]);
  });

  it("offers exactly face to face and virtual as hearing modes", () => {
    const mode = sectionFields("administrative_hearing").find((field) => field.key === "mode");
    expect(mode?.options).toEqual([
      { value: "face_to_face", label: "Face to face" },
      { value: "virtual", label: "Virtual" },
    ]);
  });
});

describe("parseStageDetails", () => {
  it("trims text, turns dates into UTC calendar days and drops blank fields", () => {
    const parsed = parseStageDetails("nte_scheduled", { date: "2026-11-20", violations: "  Tardiness ", sentDate: "", remarks: "   " });
    expect(parsed.date).toEqual(new Date("2026-11-20T00:00:00.000Z"));
    expect(parsed.violations).toBe("Tardiness");
    expect(Object.keys(parsed).sort()).toEqual(["date", "violations"]);
  });

  it("returns an empty section for an empty body", () => {
    expect(parseStageDetails("sanction", {})).toEqual({});
  });

  it("rejects a field that belongs to another section", () => {
    expect(() => parseStageDetails("nte_scheduled", { mode: "virtual" })).toThrow(ValidationError);
  });

  it("rejects a hearing mode that is not one of the two", () => {
    expect(() => parseStageDetails("administrative_hearing", { mode: "phone" })).toThrow(ValidationError);
    expect(parseStageDetails("administrative_hearing", { mode: "virtual" }).mode).toBe("virtual");
  });

  it("rejects text over the limit and a body that is not an object", () => {
    expect(() => parseStageDetails("sanction", { remarks: "x".repeat(1001) })).toThrow(ValidationError);
    expect(() => parseStageDetails("sanction", "nope")).toThrow(ValidationError);
    expect(() => parseStageDetails("sanction", { date: "not a date" })).toThrow(ValidationError);
  });
});

describe("hasSectionData and summarizeSection", () => {
  it("treats a missing or empty section as having no data", () => {
    expect(hasSectionData(undefined)).toBe(false);
    expect(hasSectionData(null)).toBe(false);
    expect(hasSectionData({})).toBe(false);
    expect(hasSectionData({ remarks: "Signed" })).toBe(true);
  });

  it("summarises a hearing as its date and mode", () => {
    expect(summarizeSection("administrative_hearing", { hearingDate: new Date("2026-12-03"), mode: "virtual" })).toBe("Dec 3, 2026 · Virtual");
  });

  it("falls back to the section date, and is empty with no data", () => {
    expect(summarizeSection("nte_scheduled", { date: new Date("2026-11-20") })).toBe("Nov 20, 2026");
    expect(summarizeSection("nte_scheduled", { violations: "Tardiness" })).toBe("");
    expect(summarizeSection("sanction", undefined)).toBe("");
  });
});

describe("serializeStageDetails", () => {
  it("turns stored sections into plain strings for the browser, dates as ISO text", () => {
    const out = serializeStageDetails({
      administrative_hearing: { hearingDate: new Date("2026-12-03"), mode: "virtual", remarks: "Sent" },
      sanction: {},
    });
    expect(out).toEqual({ administrative_hearing: { hearingDate: "2026-12-03T00:00:00.000Z", mode: "virtual", remarks: "Sent" } });
  });

  it("is undefined when nothing is recorded, or the value is not an object", () => {
    expect(serializeStageDetails(undefined)).toBeUndefined();
    expect(serializeStageDetails({})).toBeUndefined();
    expect(serializeStageDetails("junk")).toBeUndefined();
  });
});
