import { describe, it, expect } from "vitest";
import { endReasonChoices } from "@/domains/workforce/end-reasons";

const seeded = [
  { code: "active", name: "Active", metadata: { isActiveHeadcount: true } },
  { code: "on_leave", name: "On Leave", metadata: { isActiveHeadcount: true } },
  { code: "terminated", name: "Terminated", metadata: { isActiveHeadcount: false } },
  { code: "resigned", name: "Resigned", metadata: { isActiveHeadcount: false } },
  { code: "awol", name: "AWOL", metadata: { isActiveHeadcount: false } },
];

describe("endReasonChoices", () => {
  it("offers every status that is not active headcount, in catalog order", () => {
    expect(endReasonChoices(seeded).map((reason) => reason.code)).toEqual(["terminated", "resigned", "awol"]);
  });

  it("asks for a note on Terminated and AWOL, not on Resigned", () => {
    const byCode = Object.fromEntries(endReasonChoices(seeded).map((reason) => [reason.code, reason.requiresNote]));
    expect(byCode).toEqual({ terminated: true, resigned: false, awol: true });
  });

  it("lets HR turn the note requirement on or off with a catalog flag", () => {
    const custom = [
      { code: "resigned", name: "Resigned", metadata: { isActiveHeadcount: false, requiresNote: true } },
      { code: "terminated", name: "Terminated", metadata: { isActiveHeadcount: false, requiresNote: false } },
    ];
    const byCode = Object.fromEntries(endReasonChoices(custom).map((reason) => [reason.code, reason.requiresNote]));
    expect(byCode).toEqual({ resigned: true, terminated: false });
  });

  it("offers a status HR added in Settings, such as End of probation", () => {
    const withCustom = [...seeded, { code: "end_of_probation", name: "End of probation", metadata: { isActiveHeadcount: false } }];
    expect(endReasonChoices(withCustom).map((reason) => reason.code)).toContain("end_of_probation");
  });

  it("does not offer an item with no flag, because the system counts it as active (only 'terminated' is the exception)", () => {
    const unflagged = [
      { code: "resigned", name: "Resigned" },
      { code: "terminated", name: "Terminated" },
    ];
    expect(endReasonChoices(unflagged).map((reason) => reason.code)).toEqual(["terminated"]);
  });

  it("falls back to Terminated when the status catalog is not configured", () => {
    expect(endReasonChoices([])).toEqual([{ code: "terminated", name: "Terminated", requiresNote: true }]);
  });
});
