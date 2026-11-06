import { describe, expect, it } from "vitest";
import {
  arrivalActivity,
  median,
  monthlyFlows,
  periodFlows,
  periodMonths,
  recruitmentFunnel,
  retentionCohorts,
} from "../aggregates";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const day = d("2026-11-06");

describe("recruitment funnel", () => {
  it("counts open candidacies per stage and averages the time spent at each stage", () => {
    const funnel = recruitmentFunnel(
      [
        {
          stage: "MEETING",
          createdAt: d("2026-10-01"),
          closedAt: null,
          events: [{ at: d("2026-10-11"), toStage: "MEETING" }],
        },
        {
          stage: "CONFIRMED",
          createdAt: d("2026-10-01"),
          closedAt: null,
          events: [
            { at: d("2026-10-21"), toStage: "MEETING" },
            { at: d("2026-10-31"), toStage: "CONFIRMED" },
          ],
        },
        { stage: "DONE", createdAt: d("2026-01-01"), closedAt: d("2026-03-01"), events: [] },
      ],
      ["FIRST_CONTACT", "MEETING", "CONFIRMED"],
      day,
    );
    expect(funnel).toEqual([
      // 10 and 20 days at first contact (the closed one has no change: not counted).
      { stage: "FIRST_CONTACT", count: 0, averageDays: 15 },
      // 26 days (still there) and 10 days.
      { stage: "MEETING", count: 1, averageDays: 18 },
      { stage: "CONFIRMED", count: 1, averageDays: 6 },
    ]);
  });
});

describe("retention cohorts", () => {
  it("only cohorts whose 12 months are over; share still present after 12 months", () => {
    const people = [
      { entryDate: d("2025-07-10"), leftAt: null },
      { entryDate: d("2025-08-10"), leftAt: d("2026-01-01") }, // left within 12 months
      { entryDate: d("2025-09-10"), leftAt: d("2026-10-01") }, // left after 12 months
      { entryDate: d("2025-11-10"), leftAt: null }, // its quarter is not over
    ];
    const cohorts = retentionCohorts(people, day, 2);
    expect(cohorts).toEqual([
      { label: "T2 2025", entered: 0, retained: 0, rate: null },
      { label: "T3 2025", entered: 3, retained: 2, rate: 67 },
    ]);
  });
});

describe("monthly flows", () => {
  it("12 months of arrivals and departures, ending with the current month", () => {
    const flows = monthlyFlows(
      [
        { entryDate: d("2026-11-02"), leftAt: null },
        { entryDate: d("2025-01-01"), leftAt: d("2026-10-15") },
      ],
      day,
    );
    expect(flows).toHaveLength(12);
    expect(flows[0]?.label).toBe("déc. 2025");
    expect(flows.at(-1)).toEqual({ label: "nov. 2026", arrivals: 1, departures: 0 });
    expect(flows.at(-2)).toEqual({ label: "oct. 2026", arrivals: 0, departures: 1 });
  });
});

describe("DLUS dashboard aggregates (step 16)", () => {
  const day = new Date("2026-11-06T00:00:00Z");

  it("periods: 12 rolling months, this year, last year", () => {
    const rolling = periodMonths("12mois", day);
    expect(rolling[0]?.start.toISOString().slice(0, 7)).toBe("2025-12");
    expect(rolling[11]?.start.toISOString().slice(0, 7)).toBe("2026-11");
    expect(periodMonths("annee", day)[0]?.start.toISOString().slice(0, 7)).toBe("2026-01");
    expect(periodMonths("precedente", day)[11]?.start.toISOString().slice(0, 7)).toBe("2025-12");
  });

  it("flows: arrivals, departures, balance, the current month marked", () => {
    const people = [
      { entryDate: new Date("2026-11-02T00:00:00Z"), leftAt: null },
      { entryDate: new Date("2025-03-01T00:00:00Z"), leftAt: new Date("2026-11-03T00:00:00Z") },
    ];
    const last = periodFlows(people, "12mois", day).at(-1);
    expect(last).toMatchObject({ arrivals: 1, departures: 1, balance: 0, current: true });
    expect(periodFlows(people, "precedente", day).some((m) => m.current)).toBe(false);
  });

  it("median rounded to the day", () => {
    expect(median([])).toBeNull();
    expect(median([10, 2, 30])).toBe(10);
    expect(median([1, 2, 3, 4])).toBe(3);
  });

  it("activity: first training perimeter, then the wished activities, then « autre »", () => {
    expect(arrivalActivity({ firstTrainingPerimeters: ["LASER"], wishedActivities: [] })).toBe(
      "urgence",
    );
    expect(
      arrivalActivity({ firstTrainingPerimeters: [], wishedActivities: ["Postes de secours"] }),
    ).toBe("secours");
    expect(arrivalActivity({ firstTrainingPerimeters: [], wishedActivities: ["Maraude"] })).toBe(
      "autre",
    );
  });
});
