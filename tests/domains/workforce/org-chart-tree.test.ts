import { describe, it, expect } from "vitest";
import { arrange, canLink, chartProblems, link, CARD_WIDTH, type ChartNode } from "@/domains/workforce/org-chart-tree";

const card = (key: string, x = 0, employeeId?: string): ChartNode => ({ key, type: employeeId ? "person" : "group", employeeId, label: employeeId ? undefined : key, x, y: 0 });

describe("org chart rules", () => {
  it("accepts a tree", () => {
    expect(chartProblems([card("a"), card("b"), card("c")], [{ from: "a", to: "b" }, { from: "a", to: "c" }])).toEqual([]);
  });

  it("rejects circles, two parents, self-links, missing cards and duplicate people", () => {
    expect(chartProblems([card("a"), card("b"), card("c")], [{ from: "a", to: "c" }, { from: "b", to: "c" }])).toContain("A card can only sit under one card");
    // Two cards under each other is a circle (each still has only one parent).
    expect(chartProblems([card("a"), card("b")], [{ from: "a", to: "b" }, { from: "b", to: "a" }])).toContain("The links go round in a circle");
    expect(chartProblems([card("a"), card("b"), card("c")], [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }])).toContain("The links go round in a circle");
    expect(chartProblems([card("a")], [{ from: "a", to: "a" }])).toContain("A card can't be linked to itself");
    expect(chartProblems([card("a")], [{ from: "a", to: "zz" }])).toContain("A line points to a card that isn't on the chart");
    expect(chartProblems([card("a", 0, "e1"), card("b", 0, "e1")], [])).toContain("Someone is on the chart twice");
  });

  it("won't let a manager go under their own team, and moves a card to its new parent", () => {
    const edges = [{ from: "ceo", to: "mgr" }, { from: "mgr", to: "staff" }];
    expect(canLink(edges, "staff", "ceo")).toBe(false);
    expect(canLink(edges, "staff", "mgr")).toBe(false);
    expect(canLink(edges, "ceo", "staff")).toBe(true);
    expect(link(edges, "ceo", "staff")).toEqual([{ from: "ceo", to: "mgr" }, { from: "ceo", to: "staff" }]);
  });
});

describe("arrange", () => {
  it("lays out a tidy tree: parents centered above children, levels below each other", () => {
    const nodes = arrange([card("root"), card("left", 0), card("right", 10)], [{ from: "root", to: "left" }, { from: "root", to: "right" }]);
    const at = Object.fromEntries(nodes.map((node) => [node.key, node]));
    expect(at.left.y).toBe(at.right.y);
    expect(at.left.y).toBeGreaterThan(at.root.y);
    expect(at.right.x - at.left.x).toBeGreaterThanOrEqual(CARD_WIDTH);
    expect(at.root.x).toBe(Math.round((at.left.x + at.right.x) / 2));
  });
});
