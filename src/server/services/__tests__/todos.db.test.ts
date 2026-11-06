import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail, USERS } from "../../../../prisma/seed/index";
import { loadActor } from "@/server/auth/loadActor";
import { DomainError } from "@/server/errors";
import { can } from "@/server/policy/can";
import { loadTodoFacts } from "@/server/policy/todoFacts";
import type { Actor } from "@/server/policy/types";
import { setActive } from "@/server/services/accounts";
import {
  addProjectMember,
  archiveTodo,
  commentTodo,
  createProject,
  createTodo,
  detachTodosFromPerson,
  getProject,
  getTodo,
  listConfidedTodos,
  listMyTodos,
  removeProjectMember,
  restoreTodo,
  runTodoDueReminders,
  setProjectMemberRole,
  setTodoCompleted,
  visibleTodoIds,
  withdrawFromTodo,
} from "@/server/services/todos";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};

function who(key: string): Actor {
  const a = actors[key];
  if (!a) throw new Error(key);
  return a;
}

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const user of USERS) {
    const row = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(user.key) } });
    const actor = await loadActor(db, row.id);
    if (!actor) throw new Error(user.key);
    actors[user.key] = actor;
  }
}, 180_000);

describe("todoVisibleSql mirrors can() on the seed", () => {
  it("returns exactly the tasks can(todo.read) allows, for every demo account", async () => {
    const all = await db.todo.findMany({ where: { archivedAt: null }, select: { id: true } });
    expect(all.length).toBeGreaterThan(50);
    const facts = await Promise.all(all.map((t) => loadTodoFacts(db, t.id)));
    for (const user of USERS) {
      const actor = who(user.key);
      const expected = facts
        .filter((f) => f !== null && can(actor, "todo.read", { todo: f }).allowed)
        .map((f) => f?.todoId)
        .sort();
      const sql = (await visibleTodoIds(db, actor.userId)).sort();
      expect(sql, user.key).toEqual(expected);
      expect(sql.length, user.key).toBeGreaterThan(0);
    }
  });

  it("TOPAZE has no override: she does not see LASER's personal tasks", async () => {
    const ids = await visibleTodoIds(db, who("topaze").userId);
    expect(ids).not.toContain("seed_todo_laser_late");
  });
});

describe("lists", () => {
  it("« Ma liste » holds the tasks assigned to me, projects included; « Confiées » the others", async () => {
    const mine = await listMyTodos(db, who("action"), { now: day });
    const titles = mine.open.map((t) => t.id);
    expect(titles).toContain("seed_todo_action_late");
    expect(titles).toContain("seed_todo_shared");
    expect(titles).toContain("seed_todo_forum_2");
    // Confided by TOPAZE to ACTION (the next demo account).
    expect(titles).toContain("seed_todo_topaze_confided");
    const confided = await listConfidedTodos(db, who("topaze"), day);
    expect(confided.map((t) => t.id)).toContain("seed_todo_topaze_confided");
  });

  it("a person ACTION cannot see is shown as « non accessible »", async () => {
    const todo = await getTodo(db, who("action"), "seed_todo_hidden_person");
    expect(todo.person).toEqual({ state: "hidden" });
    const own = await getTodo(db, who("diamant"), "seed_todo_hidden_person");
    expect(own.person?.state).toBe("visible");
  });

  it("an outsider gets « not found », not the task", async () => {
    await expect(getTodo(db, who("laser"), "seed_todo_topaze_late")).rejects.toBeInstanceOf(
      DomainError,
    );
  });
});

describe("writes", () => {
  it("a shared task checked by one is done for the others; the author is notified", async () => {
    const { id } = await createTodo(db, who("topaze"), {
      title: "Tâche partagée de test",
      assigneeIds: [who("action").userId, who("laser").userId],
    });
    await setTodoCompleted(db, who("laser"), { todoId: id, completed: true });
    const seen = await getTodo(db, who("action"), id);
    expect(seen.completedAt).not.toBeNull();
    expect(seen.completedBy?.id).toBe(who("laser").userId);
    const notices = await db.notification.count({
      where: { userId: who("topaze").userId, dedupeKey: { startsWith: `todo:done:${id}` } },
    });
    expect(notices).toBe(1);
  });

  it("the title and the note never reach the audit log", async () => {
    const { id } = await createTodo(db, who("format"), {
      title: "Titre confidentiel 7f3a",
      note: "Note confidentielle 7f3a",
    });
    const logs = await db.auditLog.findMany({ where: { entityId: id } });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain("7f3a");
  });

  it("archive, then restore within 30 days, never after", async () => {
    const { id } = await createTodo(db, who("format"), { title: "À archiver" });
    await archiveTodo(db, who("format"), { todoId: id });
    expect((await visibleTodoIds(db, who("format").userId)).includes(id)).toBe(false);
    await restoreTodo(db, who("format"), { todoId: id });
    expect((await visibleTodoIds(db, who("format").userId)).includes(id)).toBe(true);
    await archiveTodo(db, who("format"), { todoId: id });
    const later = new Date(Date.now() + 31 * 86_400_000);
    await expect(restoreTodo(db, who("format"), { todoId: id }, later)).rejects.toThrow("30 jours");
  });

  it("only the author (or a project OWNER) may archive", async () => {
    await expect(
      archiveTodo(db, who("action"), { todoId: "seed_todo_topaze_confided" }),
    ).rejects.toThrow();
  });

  it("« Ce n'est pas pour moi » removes me and gives the task back to its author", async () => {
    const { id } = await createTodo(db, who("diamant"), {
      title: "Pour Noa",
      assigneeIds: [who("format").userId],
    });
    await withdrawFromTodo(db, who("format"), { todoId: id });
    const facts = await loadTodoFacts(db, id);
    expect(facts?.assigneeIds).toEqual([who("diamant").userId]);
    expect(
      await db.notification.count({
        where: { userId: who("diamant").userId, title: { contains: "refusé" } },
      }),
    ).toBeGreaterThan(0);
  });

  it("a confided task can only go to an active responsible", async () => {
    await expect(
      createTodo(db, who("topaze"), { title: "x", assigneeIds: ["nobody"] }),
    ).rejects.toThrow("responsable actif");
  });
});

describe("projects", () => {
  it("created with two members, commented; a removed member no longer sees it", async () => {
    const { id } = await createProject(db, who("laser"), {
      name: "Projet de test",
      memberIds: [who("format-gp").userId],
    });
    const { id: todoId } = await createTodo(db, who("format-gp"), {
      title: "Tâche du projet",
      projectId: id,
    });
    await commentTodo(db, who("laser"), { todoId, body: "Commentaire de test" });
    expect(
      await db.notification.count({
        where: { userId: who("format-gp").userId, dedupeKey: { startsWith: "todo:comment:" } },
      }),
    ).toBeGreaterThan(0);
    await removeProjectMember(db, who("laser"), { projectId: id, userId: who("format-gp").userId });
    await expect(getProject(db, who("format-gp"), id)).rejects.toThrow("introuvable");
    // Her assignment on the open task went with the membership; she was its author, though.
    expect((await loadTodoFacts(db, todoId))?.assigneeIds).toEqual([]);
  });

  it("keeps at least one OWNER", async () => {
    const { id } = await createProject(db, who("laser"), { name: "Un seul OWNER" });
    await addProjectMember(db, who("laser"), { projectId: id, userId: who("action").userId });
    await expect(
      setProjectMemberRole(db, who("laser"), {
        projectId: id,
        userId: who("laser").userId,
        role: "MEMBER",
      }),
    ).rejects.toThrow("au moins un OWNER");
    await expect(
      removeProjectMember(db, who("laser"), { projectId: id, userId: who("laser").userId }),
    ).rejects.toThrow("au moins un OWNER");
    // A MEMBER may not manage the project.
    await expect(
      addProjectMember(db, who("action"), { projectId: id, userId: who("format").userId }),
    ).rejects.toThrow();
  });
});

describe("system", () => {
  it("the daily task notifies tasks due today once, even when replayed", async () => {
    const first = await runTodoDueReminders(db, day);
    expect(first).toBeGreaterThan(0);
    expect(await runTodoDueReminders(db, day)).toBe(0);
    const keys = await db.notification.findMany({
      where: { dedupeKey: { startsWith: "todo:due:" } },
      select: { userId: true, dedupeKey: true },
    });
    expect(new Set(keys.map((k) => `${k.userId}:${k.dedupeKey}`)).size).toBe(keys.length);
  });

  it("the purge detaches the tasks from the person, without deleting them", async () => {
    const todo = await db.todo.findUniqueOrThrow({ where: { id: "seed_todo_topaze_person" } });
    expect(todo.personId).not.toBeNull();
    await db.$transaction((tx) => detachTodosFromPerson(tx, todo.personId ?? ""));
    const after = await db.todo.findUniqueOrThrow({ where: { id: todo.id } });
    expect(after.personId).toBeNull();
    expect(after.title).toBe(todo.title);
  });

  it("deactivating an account removes its assignments and hands its projects to the oldest member", async () => {
    // Recrutement printemps: diamant is the only OWNER; topaze joined first.
    await setActive(db, who("topaze"), { userId: who("diamant").userId, active: false });
    const assigned = await db.todoAssignee.count({
      where: { userId: who("diamant").userId, removedAt: null },
    });
    expect(assigned).toBe(0);
    const heir = await db.todoProjectMember.findFirstOrThrow({
      where: { projectId: "seed_tp_recrutement", userId: who("topaze").userId, removedAt: null },
    });
    expect(heir.role).toBe("OWNER");
    // Tasks she confided stay visible to their assignee.
    expect(await visibleTodoIds(db, who("format-diamant").userId)).toContain(
      "seed_todo_diamant_confided",
    );
    await setActive(db, who("topaze"), { userId: who("diamant").userId, active: true });
  });
});
