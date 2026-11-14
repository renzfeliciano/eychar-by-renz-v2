import { describe, it, expect } from "vitest";
import { educationLevelName, educationLevelOptions } from "@/domains/catalog/education-level-options";

const levels = [
  { code: "high_school_graduate", name: "High School / Junior High School Graduate", status: "active", sortOrder: 1 },
  { code: "bachelors_degree", name: "Bachelor’s Degree", status: "active", sortOrder: 6 },
  { code: "masters_degree", name: "Master’s Degree", status: "inactive", sortOrder: 8 },
];

describe("educationLevelOptions", () => {
  it("offers the active levels in catalog order", () => {
    expect(educationLevelOptions(levels, null)).toEqual([
      { id: "high_school_graduate", label: "High School / Junior High School Graduate" },
      { id: "bachelors_degree", label: "Bachelor’s Degree" },
    ]);
  });

  it("keeps a person's current level in the list even after HR retires it, so their form still shows it", () => {
    const options = educationLevelOptions(levels, "masters_degree");
    expect(options.map((option) => option.id)).toEqual(["high_school_graduate", "bachelors_degree", "masters_degree"]);
    expect(options.find((option) => option.id === "masters_degree")?.label).toBe("Master’s Degree (retired)");
  });

  it("does not repeat a current level that is still active", () => {
    expect(educationLevelOptions(levels, "bachelors_degree").filter((option) => option.id === "bachelors_degree")).toHaveLength(1);
  });

  it("keeps a current code that has no catalog item, shown as entered, rather than silently dropping it", () => {
    expect(educationLevelOptions([], "legacy_entry")).toEqual([{ id: "legacy_entry", label: "legacy_entry" }]);
  });

  it("offers nothing when there is no catalog and no current value", () => {
    expect(educationLevelOptions([], undefined)).toEqual([]);
  });
});

describe("educationLevelName", () => {
  it("shows a level's name, whether it is active or retired", () => {
    expect(educationLevelName(levels, "bachelors_degree")).toBe("Bachelor’s Degree");
    expect(educationLevelName(levels, "masters_degree")).toBe("Master’s Degree");
  });

  it("shows a code with no catalog item as entered, and nothing for no code", () => {
    expect(educationLevelName(levels, "legacy_entry")).toBe("legacy_entry");
    expect(educationLevelName(levels, null)).toBe("");
    expect(educationLevelName(levels, undefined)).toBe("");
    expect(educationLevelName(levels, "")).toBe("");
  });
});
