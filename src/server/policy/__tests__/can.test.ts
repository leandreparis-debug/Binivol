// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Perimeter, Profile } from "@/generated/prisma/enums";
import { POLICY_ACTIONS, type PolicyAction } from "@/lib/actions";
import {
  authorize,
  can,
  canSome,
  ForbiddenError,
  personPageAccess,
  relevesOf,
} from "@/server/policy/can";
import type { PersonFacts } from "@/server/policy/types";

/*
 * Truth table written independently of matrix.ts: if the matrix changes, this
 * file must change too, on purpose.
 */

const PROFILES: Profile[] = ["TOPAZE", "ACTION", "LASER", "FORMAT", "FORMAT_GP", "DIAMANT"];
const CASES = ["releve", "neReleve", "candidat", "archivee", "nouveau"] as const;
type Case = (typeof CASES)[number];

const PERIMETER: Partial<Record<Profile, Perimeter>> = {
  ACTION: "ACTION",
  LASER: "LASER",
  FORMAT_GP: "FORMAT_GP",
};

function facts(c: Case, profile: Profile): PersonFacts {
  const base = {
    personId: "p",
    status: "ACTIVE" as const,
    perimeters: new Set<Perimeter>(),
    inDiamantScope: false,
    archived: false,
  };
  switch (c) {
    case "releve": {
      const perimeter = PERIMETER[profile];
      return {
        ...base,
        perimeters: new Set(perimeter ? [perimeter] : []),
        inDiamantScope: profile === "DIAMANT",
      };
    }
    case "neReleve":
      return base;
    case "candidat":
      // A candidate who already holds PSC: perimeters must not leak her to ACTION.
      return {
        ...base,
        status: "CANDIDATE",
        perimeters: new Set(["ACTION"]),
        inDiamantScope: true,
      };
    case "archivee":
      return {
        ...base,
        archived: true,
        perimeters: new Set(["ACTION", "LASER", "FORMAT_GP"]),
        inDiamantScope: true,
      };
    case "nouveau":
      return { ...base, inDiamantScope: true };
  }
}

const actor = (...profiles: Profile[]) => ({ profiles: new Set(profiles) });
const ALL = new Set<Case>(CASES);
const NONE = new Set<Case>();
const set = (...cases: Case[]) => new Set<Case>(cases);
const ONLY_RELEVE = set("releve");
const DIAMANT_SCOPE = set("releve", "candidat", "nouveau");
const VOLUNTEERS = set("releve", "neReleve", "nouveau");

type Expected = Partial<Record<Profile, Set<Case>>>;
const personRead: Expected = {
  ACTION: ONLY_RELEVE,
  LASER: ONLY_RELEVE,
  FORMAT_GP: ONLY_RELEVE,
  DIAMANT: DIAMANT_SCOPE,
};
const diamantOnly: Expected = { DIAMANT: DIAMANT_SCOPE };
const formatOnly: Expected = { FORMAT: VOLUNTEERS };

/** Person-scoped actions: profile → cases allowed (TOPAZE is always allowed). */
const PERSON_TABLE: Partial<Record<PolicyAction, Expected>> = {
  "person.directory.read": {
    ACTION: VOLUNTEERS,
    LASER: VOLUNTEERS,
    FORMAT: VOLUNTEERS,
    FORMAT_GP: VOLUNTEERS,
    DIAMANT: set("releve", "neReleve", "candidat", "nouveau"),
  },
  "person.full.read": personRead,
  "person.sensitive.read": personRead,
  "person.update": diamantOnly,
  "person.status.change": {},
  "person.nivol.correct": {},
  "candidacy.finalize.undo": {},
  "b3.manage": {},
  "person.return": {
    DIAMANT: set("releve", "neReleve", "candidat", "nouveau"),
  },
  "training.read": { ...personRead, FORMAT: VOLUNTEERS },
  "training.write": formatOnly,
  "trainingWish.manage": formatOnly,
  "appointment.read": personRead,
  "candidacy.manage": diamantOnly,
  "dossier.manage": diamantOnly,
  "mentorship.manage": diamantOnly,
  "followUp.manage": diamantOnly,
  "document.read": personRead,
  "document.upload": diamantOnly,
  "document.archived.read": {},
  "alert.training.read": { ...personRead, DIAMANT: NONE, FORMAT: VOLUNTEERS },
  "alert.integration.read": diamantOnly,
  "alert.admin.read": {},
  "person.gdprExport": {},
};

/** « À faire » (step 16): relational rules, tested in their own block below. */
const TODO_ACTIONS: PolicyAction[] = [
  "todo.read",
  "todo.write",
  "todo.manage",
  "todo.project.manage",
];

/** Resource-less actions: profiles allowed. */
const GLOBAL_TABLE: Partial<Record<PolicyAction, Profile[]>> = {
  "trainingSession.manage": ["TOPAZE", "FORMAT"],
  "user.manage": ["TOPAZE"],
  "reference.manage": ["TOPAZE", "FORMAT"],
  "setting.manage": ["TOPAZE"],
  "reminderRule.manage": ["TOPAZE"],
  "audit.read": ["TOPAZE"],
  "accessLog.read": ["TOPAZE"],
  "person.export": ["TOPAZE"],
  "import.run": ["TOPAZE"],
  "mail.log.read": ["TOPAZE"],
  "candidacy.create": ["TOPAZE", "DIAMANT"],
  "notification.readOwn": PROFILES,
  "person.purge": ["TOPAZE"],
  "dashboard.dlus.read": ["TOPAZE"],
  "training.matrix.export": ["TOPAZE", "FORMAT", "ACTION", "LASER", "FORMAT_GP"],
};

describe("truth table coverage", () => {
  it("covers every action of the closed list", () => {
    const covered = [
      ...Object.keys(PERSON_TABLE),
      ...Object.keys(GLOBAL_TABLE),
      "appointment.write",
      ...TODO_ACTIONS,
    ].sort();
    expect(covered).toEqual([...POLICY_ACTIONS].sort());
  });
});

describe.each(Object.entries(PERSON_TABLE))("%s", (action, expected) => {
  it.each(PROFILES)("profile %s alone", (profile) => {
    const allowedCases = profile === "TOPAZE" ? ALL : (expected[profile] ?? NONE);
    for (const c of CASES) {
      const decision = can(actor(profile), action as PolicyAction, { person: facts(c, profile) });
      expect(decision.allowed, `${action} · ${profile} · ${c} — ${decision.reason}`).toBe(
        allowedCases.has(c),
      );
      expect(decision.reason.length).toBeGreaterThan(0);
    }
  });

  it("refuses when the person is not given", () => {
    expect(can(actor("TOPAZE"), action as PolicyAction).allowed).toBe(false);
  });
});

describe.each(Object.entries(GLOBAL_TABLE))("%s", (action, allowed) => {
  it.each(PROFILES)("profile %s alone", (profile) => {
    expect(can(actor(profile), action as PolicyAction).allowed).toBe(allowed.includes(profile));
  });
});

describe("appointment.write", () => {
  const fn = (code: string, managedBy: Profile[]) => ({ code, managedBy });
  const CHEF_PAPS = fn("CHEF_PAPS", ["ACTION"]);
  const CI_SDIS = fn("CI_SDIS", ["LASER"]);
  const CH_TECH = fn("CH_TECH", ["ACTION", "LASER"]);
  const ASSIST = fn("ASSIST_FORM", ["FORMAT_GP"]);
  const pse = {
    ...facts("neReleve", "ACTION"),
    perimeters: new Set<Perimeter>(["ACTION", "LASER"]),
  };

  it("TOPAZE may appoint to any function, for anybody", () => {
    expect(
      can(actor("TOPAZE"), "appointment.write", {
        person: facts("neReleve", "TOPAZE"),
        function: CI_SDIS,
      }).allowed,
    ).toBe(true);
  });

  it("ACTION may not appoint to CI_SDIS, LASER may", () => {
    expect(
      can(actor("ACTION"), "appointment.write", { person: pse, function: CI_SDIS }).allowed,
    ).toBe(false);
    expect(
      can(actor("LASER"), "appointment.write", { person: pse, function: CI_SDIS }).allowed,
    ).toBe(true);
  });

  it("ACTION may appoint to CHEF_PAPS only someone of her perimeter", () => {
    expect(
      can(actor("ACTION"), "appointment.write", { person: pse, function: CHEF_PAPS }).allowed,
    ).toBe(true);
    expect(
      can(actor("ACTION"), "appointment.write", {
        person: facts("neReleve", "ACTION"),
        function: CHEF_PAPS,
      }).allowed,
    ).toBe(false);
  });

  it("drivers are shared by ACTION and LASER; ASSIST_FORM by FORMAT_GP", () => {
    expect(
      can(actor("LASER"), "appointment.write", { person: pse, function: CH_TECH }).allowed,
    ).toBe(true);
    const trainer = {
      ...facts("neReleve", "FORMAT_GP"),
      perimeters: new Set<Perimeter>(["FORMAT_GP"]),
    };
    expect(
      can(actor("FORMAT_GP"), "appointment.write", { person: trainer, function: ASSIST }).allowed,
    ).toBe(true);
    expect(
      can(actor("FORMAT"), "appointment.write", { person: trainer, function: ASSIST }).allowed,
    ).toBe(false);
    expect(
      can(actor("DIAMANT"), "appointment.write", {
        person: facts("nouveau", "DIAMANT"),
        function: CHEF_PAPS,
      }).allowed,
    ).toBe(false);
  });

  it("refuses an archived person and a missing function", () => {
    const archived = { ...pse, archived: true };
    expect(
      can(actor("ACTION"), "appointment.write", { person: archived, function: CHEF_PAPS }).allowed,
    ).toBe(false);
    expect(can(actor("ACTION"), "appointment.write", { person: pse }).allowed).toBe(false);
  });
});

describe("profiles add up", () => {
  it("FORMAT + DIAMANT: trainings of a candidate through DIAMANT, sensitive data only in the DIAMANT scope", () => {
    const both = actor("FORMAT", "DIAMANT");
    expect(can(both, "training.read", { person: facts("candidat", "DIAMANT") }).allowed).toBe(true);
    expect(can(both, "training.write", { person: facts("neReleve", "FORMAT") }).allowed).toBe(true);
    expect(
      can(both, "person.sensitive.read", { person: facts("neReleve", "FORMAT") }).allowed,
    ).toBe(false);
    expect(
      can(both, "person.sensitive.read", { person: facts("nouveau", "DIAMANT") }).allowed,
    ).toBe(true);
    expect(can(both, "user.manage").allowed).toBe(false);
  });

  it("ACTION + LASER: a person with only LASER perimeter is readable", () => {
    const both = actor("ACTION", "LASER");
    const laserOnly = { ...facts("neReleve", "LASER"), perimeters: new Set<Perimeter>(["LASER"]) };
    expect(can(both, "person.full.read", { person: laserOnly }).allowed).toBe(true);
    expect(can(actor("ACTION"), "person.full.read", { person: laserOnly }).allowed).toBe(false);
  });

  it("a PSE holder relève of both ACTION and LASER", () => {
    const pse = {
      ...facts("neReleve", "ACTION"),
      perimeters: new Set<Perimeter>(["ACTION", "LASER"]),
    };
    expect(relevesOf(pse, "ACTION") && relevesOf(pse, "LASER")).toBe(true);
    expect(relevesOf(pse, "FORMAT")).toBe(false);
    expect(relevesOf(pse, "TOPAZE")).toBe(false);
  });
});

describe("targeted cases", () => {
  it("FORMAT reads everybody's trainings but never sensitive data", () => {
    for (const c of ["releve", "neReleve", "nouveau"] as const) {
      expect(can(actor("FORMAT"), "training.read", { person: facts(c, "FORMAT") }).allowed).toBe(
        true,
      );
      expect(
        can(actor("FORMAT"), "person.sensitive.read", { person: facts(c, "FORMAT") }).allowed,
      ).toBe(false);
      expect(can(actor("FORMAT"), "document.read", { person: facts(c, "FORMAT") }).allowed).toBe(
        false,
      );
    }
  });

  it("a trainer (isTrainer → FORMAT_GP perimeter) is visible to FORMAT_GP", () => {
    const trainer = {
      ...facts("neReleve", "FORMAT_GP"),
      perimeters: new Set<Perimeter>(["FORMAT_GP"]),
    };
    expect(can(actor("FORMAT_GP"), "person.full.read", { person: trainer }).allowed).toBe(true);
  });

  it("a candidate is hidden from ACTION, even with PSC", () => {
    expect(
      can(actor("ACTION"), "person.directory.read", { person: facts("candidat", "ACTION") })
        .allowed,
    ).toBe(false);
    expect(
      can(actor("ACTION"), "person.full.read", { person: facts("candidat", "ACTION") }).allowed,
    ).toBe(false);
  });

  it("an archived person is TOPAZE's only, with an explicit reason", () => {
    const decision = can(actor("DIAMANT"), "person.directory.read", {
      person: facts("archivee", "DIAMANT"),
    });
    expect(decision).toEqual({
      allowed: false,
      reason: expect.stringContaining("archivée") as string,
    });
    expect(
      can(actor("TOPAZE"), "person.sensitive.read", { person: facts("archivee", "TOPAZE") })
        .allowed,
    ).toBe(true);
  });

  it("an account without profile can do nothing", () => {
    for (const action of POLICY_ACTIONS) {
      expect(
        can(actor(), action, {
          person: facts("releve", "ACTION"),
          function: { code: "X", managedBy: PROFILES },
        }).allowed,
      ).toBe(false);
    }
  });
});

describe("canSome and authorize", () => {
  it("canSome tells whether a profile may ever do an action", () => {
    expect(canSome(actor("ACTION"), "person.full.read")).toBe(true);
    expect(canSome(actor("FORMAT"), "person.sensitive.read")).toBe(false);
    expect(canSome(actor("DIAMANT"), "candidacy.manage")).toBe(true);
    expect(canSome(actor("ACTION"), "candidacy.manage")).toBe(false);
    expect(canSome(actor("LASER"), "user.manage")).toBe(false);
    expect(canSome(actor("FORMAT"), "appointment.write")).toBe(false);
    expect(canSome(actor("DIAMANT"), "appointment.write")).toBe(false);
    expect(canSome(actor("FORMAT_GP"), "appointment.write")).toBe(true);
  });

  it("authorize throws a ForbiddenError with the reason", () => {
    expect(() => {
      authorize(actor("ACTION"), "user.manage");
    }).toThrow(ForbiddenError);
    expect(() => {
      authorize(actor("TOPAZE"), "user.manage");
    }).not.toThrow();
  });
});

describe("personPageAccess (full or reduced person page)", () => {
  const expected: Record<Profile, Partial<Record<Case, "full" | "trainings">>> = {
    TOPAZE: {
      releve: "full",
      neReleve: "full",
      candidat: "full",
      archivee: "full",
      nouveau: "full",
    },
    ACTION: { releve: "full" },
    LASER: { releve: "full" },
    FORMAT: { releve: "trainings", neReleve: "trainings", nouveau: "trainings" },
    FORMAT_GP: { releve: "full" },
    DIAMANT: { releve: "full", candidat: "full", nouveau: "full" },
  };
  it.each(PROFILES)("profile %s alone", (profile) => {
    for (const c of CASES) {
      expect(personPageAccess(actor(profile), facts(c, profile)), `${profile} · ${c}`).toBe(
        expected[profile][c] ?? null,
      );
    }
  });

  it("is full as soon as one cumulated profile gives person.full.read", () => {
    expect(personPageAccess(actor("FORMAT", "DIAMANT"), facts("nouveau", "DIAMANT"))).toBe("full");
    expect(personPageAccess(actor("FORMAT", "DIAMANT"), facts("neReleve", "DIAMANT"))).toBe(
      "trainings",
    );
  });
});

describe("« À faire » (step 16): relational rules, no TOPAZE override", () => {
  const who = (userId: string, profile: Profile = "ACTION") => ({
    userId,
    profiles: new Set<Profile>([profile]),
  });
  const todo = {
    todoId: "t",
    ownerId: "owner",
    assigneeIds: ["assignee"],
    projectMemberIds: ["member", "projectOwner"],
    projectOwnerIds: ["projectOwner"],
  };
  // « removed » was an assignee, « former » a member: their rows have removedAt, so
  // they are absent from the facts (loadTodoFacts keeps active links only).
  const cases: [string, ReturnType<typeof who>, boolean, boolean][] = [
    ["owner", who("owner"), true, true],
    ["active assignee", who("assignee"), true, false],
    ["removed assignee", who("removed"), false, false],
    ["project member", who("member"), true, false],
    ["project OWNER", who("projectOwner"), true, true],
    ["former member", who("former"), false, false],
    ["third party", who("stranger", "DIAMANT"), false, false],
    ["TOPAZE outsider", who("topaze", "TOPAZE"), false, false],
  ];

  it.each(cases)("%s", (_label, actorOf, reads, manages) => {
    expect(can(actorOf, "todo.read", { todo }).allowed).toBe(reads);
    expect(can(actorOf, "todo.write", { todo }).allowed).toBe(reads);
    expect(can(actorOf, "todo.manage", { todo }).allowed).toBe(manages);
  });

  it("every profile has its own list (no task, no project)", () => {
    for (const profile of PROFILES) {
      expect(can(who("x", profile), "todo.read").allowed).toBe(true);
      expect(can(who("x", profile), "todo.write").allowed).toBe(true);
    }
  });

  it("refuses without a user id, and todo.manage without a task", () => {
    expect(can(actor("TOPAZE"), "todo.read", { todo }).allowed).toBe(false);
    expect(can(who("owner"), "todo.manage").allowed).toBe(false);
  });

  it("a project: members read it, only OWNERs manage it", () => {
    const project = { projectId: "p", memberIds: ["a", "b"], ownerIds: ["a"] };
    expect(can(who("b"), "todo.read", { project }).allowed).toBe(true);
    expect(can(who("c", "TOPAZE"), "todo.read", { project }).allowed).toBe(false);
    expect(can(who("a"), "todo.project.manage", { project }).allowed).toBe(true);
    expect(can(who("b"), "todo.project.manage", { project }).allowed).toBe(false);
    expect(can(who("a"), "todo.project.manage").allowed).toBe(false);
  });
});
