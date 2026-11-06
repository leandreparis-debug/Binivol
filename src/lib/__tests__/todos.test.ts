import { describe, expect, it } from "vitest";
import {
  groupTodos,
  moveInOrder,
  parseQuickAdd,
  resolveMentions,
  resolveProjectTag,
  todoGroup,
  wouldLeaveNoOwner,
} from "@/lib/todos";

// Friday 06/11/2026.
const TODAY = "2026-11-06";

describe("parseQuickAdd", () => {
  it("keeps a plain title untouched", () => {
    expect(parseQuickAdd("  Réserver la salle  ", TODAY)).toEqual({
      title: "Réserver la salle",
      dueDate: null,
      dueText: null,
      mentions: [],
      projectTag: null,
    });
  });

  it.each([
    ["Appeler demain", "2026-11-07", "demain"],
    ["Appeler aujourd'hui", "2026-11-06", "aujourd'hui"],
    ["Appeler après-demain", "2026-11-08", "après-demain"],
    ["Appeler apres demain", "2026-11-08", "apres demain"],
    ["Appeler lundi", "2026-11-09", "lundi"],
    // Today is Friday: « vendredi » is next Friday, never today.
    ["Appeler vendredi", "2026-11-13", "vendredi"],
    ["Appeler Samedi", "2026-11-07", "Samedi"],
    ["Appeler 12/11", "2026-11-12", "12/11"],
    // Already past this year: next year.
    ["Appeler 03/01", "2027-01-03", "03/01"],
    ["Appeler 12/11/2027", "2027-11-12", "12/11/2027"],
  ])("%s → %s", (text, due, dueText) => {
    const parsed = parseQuickAdd(text, TODAY);
    expect(parsed.title).toBe("Appeler");
    expect(parsed.dueDate).toBe(due);
    expect(parsed.dueText).toBe(dueText);
  });

  it("ignores an impossible date and keeps it in the title", () => {
    const parsed = parseQuickAdd("Code 31/02", TODAY);
    expect(parsed.dueDate).toBeNull();
    expect(parsed.title).toBe("Code 31/02");
  });

  it("only the first date counts, the next ones stay in the title", () => {
    const parsed = parseQuickAdd("Préparer lundi la réunion de mardi", TODAY);
    expect(parsed.dueDate).toBe("2026-11-09");
    expect(parsed.title).toBe("Préparer la réunion de mardi");
  });

  it("reads @mentions and one #project", () => {
    const parsed = parseQuickAdd("Stand @Léa @marc.dupont #forum #autre demain", TODAY);
    expect(parsed).toMatchObject({
      title: "Stand",
      mentions: ["Léa", "marc.dupont"],
      projectTag: "forum",
      dueDate: "2026-11-07",
    });
  });

  it("works across the daylight-saving change (days are calendar days)", () => {
    expect(parseQuickAdd("x demain", "2026-10-24").dueDate).toBe("2026-10-25");
    expect(parseQuickAdd("x demain", "2026-10-25").dueDate).toBe("2026-10-26");
  });
});

describe("resolveMentions", () => {
  const people = [
    { id: "1", name: "Léa Martin" },
    { id: "2", name: "Marc Dupont" },
    { id: "3", name: "Marc Leroy" },
  ];

  it("matches first names without accents, and prénom.nom", () => {
    expect(resolveMentions(["lea", "marc.dupont"], people)).toEqual({
      ids: ["1", "2"],
      unknown: [],
    });
  });

  it("leaves ambiguous and unknown names apart", () => {
    expect(resolveMentions(["Marc", "Zoé"], people)).toEqual({ ids: [], unknown: ["Marc", "Zoé"] });
  });
});

describe("resolveProjectTag", () => {
  const projects = [
    { id: "a", name: "Forum des associations" },
    { id: "b", name: "Recrutement printemps" },
  ];

  it("matches a prefix, accents and spaces ignored", () => {
    expect(resolveProjectTag("forum", projects)?.id).toBe("a");
    expect(resolveProjectTag("recrutement-printemps", projects)?.id).toBe("b");
    expect(resolveProjectTag("zzz", projects)).toBeNull();
    expect(resolveProjectTag(null, projects)).toBeNull();
  });
});

describe("groups", () => {
  it.each([
    [null, "noDate"],
    ["2026-11-05", "overdue"],
    ["2026-11-06", "today"],
    ["2026-11-08", "week"], // Sunday of this week
    ["2026-11-09", "later"], // next Monday
  ] as const)("%s → %s", (due, group) => {
    expect(todoGroup(due, TODAY)).toBe(group);
  });

  it("keeps the order inside each group", () => {
    const groups = groupTodos(
      [
        { id: "a", dueDate: "2026-11-06" },
        { id: "b", dueDate: null },
        { id: "c", dueDate: "2026-11-06" },
      ],
      TODAY,
    );
    expect(groups.today.map((t) => t.id)).toEqual(["a", "c"]);
    expect(groups.noDate.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("at least one OWNER", () => {
  it("refuses to remove or demote the last OWNER, allows it with another one", () => {
    const one = [
      { userId: "a", role: "OWNER" as const },
      { userId: "b", role: "MEMBER" as const },
    ];
    expect(wouldLeaveNoOwner(one, "a")).toBe(true);
    expect(wouldLeaveNoOwner(one, "b")).toBe(false);
    expect(wouldLeaveNoOwner([...one, { userId: "c", role: "OWNER" }], "a")).toBe(false);
  });
});

describe("moveInOrder", () => {
  it("moves up and down, and stops at the ends", () => {
    expect(moveInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveInOrder(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveInOrder(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});
