import { describe, expect, it } from "vitest";
import { buildCsvContent, neutralizeCsvCell } from "@/lib/csv";

describe("neutralizeCsvCell", () => {
  it.each([
    ["=SUM(A1:A2)", "'=SUM(A1:A2)"],
    ["+cmd|' /C calc'!A0", "'+cmd|' /C calc'!A0"],
    ["-2+3", "'-2+3"],
    ["@SUM(1)", "'@SUM(1)"],
    ["\tvalue", "'\tvalue"],
    ["\r=1", "'\r=1"],
    ["-", "'-"],
  ])("prefixes a formula-looking string %j", (input, expected) => {
    expect(neutralizeCsvCell(input)).toBe(expected);
  });

  it.each(["-12.5", "+3", "-0", "-.5", "12"])("leaves a plain numeric string %j alone", (input) => {
    expect(neutralizeCsvCell(input)).toBe(input);
  });

  it("leaves numbers and ordinary text alone", () => {
    expect(neutralizeCsvCell(-12.5)).toBe("-12.5");
    expect(neutralizeCsvCell("Juan Dela Cruz")).toBe("Juan Dela Cruz");
    expect(neutralizeCsvCell("a=b")).toBe("a=b");
    expect(neutralizeCsvCell("")).toBe("");
  });
});

describe("buildCsvContent", () => {
  it("escapes quotes after neutralising the formula", () => {
    const csv = buildCsvContent(["Name"], [['=HYPERLINK("http://x","y")'], [-4]]);
    expect(csv.replace(/^﻿/, "").split("\n")).toEqual(['"Name"', `"'=HYPERLINK(""http://x"",""y"")"`, '"-4"']);
  });
});
