import { describe, expect, it } from "vitest";
import { groupTimeline, sortTimeline, type TimelineEvent } from "../timeline";

const ev = (id: string, date: string | null, title = id): TimelineEvent => ({
  id,
  type: "training",
  date: date ? new Date(date) : null,
  title,
});

describe("sortTimeline", () => {
  it("sorts from the most recent, events without date last", () => {
    const sorted = sortTimeline([
      ev("a", "2024-05-01T00:00:00Z"),
      ev("b", null, "Zeta"),
      ev("c", "2026-01-01T00:00:00Z"),
      ev("d", null, "Alpha"),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["c", "a", "d", "b"]);
  });
});

describe("groupTimeline", () => {
  it("groups by year (Paris time) and ends with « Date inconnue »", () => {
    const groups = groupTimeline([
      ev("a", "2024-05-01T00:00:00Z"),
      ev("b", "2024-12-31T23:30:00Z"), // already 2025 in Paris
      ev("c", null),
      ev("d", "2026-01-01T00:00:00Z"),
    ]);
    expect(groups.map((g) => [g.year, g.events.map((e) => e.id)])).toEqual([
      ["2026", ["d"]],
      ["2025", ["b"]],
      ["2024", ["a"]],
      [null, ["c"]],
    ]);
  });

  it("is empty for no event", () => {
    expect(groupTimeline([])).toEqual([]);
  });
});
