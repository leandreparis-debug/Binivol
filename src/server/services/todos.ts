import type { TodoProjectColor, TodoProjectRole } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import {
  isoDay,
  longDay,
  RESTORE_WINDOW_DAYS,
  wouldLeaveNoOwner,
  type ProjectColor,
} from "@/lib/todos";
import { toParisDay } from "@/lib/dates";
import { withAudit, type AuditRecorder } from "../audit";
import type { DbOrTx, Tx } from "../db";
import { DomainError } from "../errors";
import { authorize, can, personPageAccess } from "../policy/can";
import { loadPersonFacts, loadPersonFactsMany } from "../policy/facts";
import { loadProjectFacts, loadTodoFacts } from "../policy/todoFacts";
import type { Actor } from "../policy/types";
import { todoVisibleSql } from "../policy/visibility";
import {
  todoRepository,
  todoSelect,
  type ProjectRow,
  type TodoRow,
} from "../repositories/todoRepository";

/**
 * « À faire » (step 16, docs/a-faire.md): personal lists, tasks confided or
 * shared between responsibles, team projects.
 *
 * Who sees what is relational (`can()`, conditions `todoParticipant`,
 * `todoManager`, `projectOwner`): the author, the active assignees and the
 * active members of the task's project. No profile sees more, TOPAZE included.
 * Every write goes through `withAudit`; titles, notes and comments are masked
 * there (`SENSITIVE_FIELDS`): only ids, field names and dates are logged.
 */

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** The person a task is linked to, as the actor may see her. */
export type LinkedPerson =
  { state: "visible"; ref: string; name: string; canOpen: boolean } | { state: "hidden" };

export interface TodoUser {
  id: string;
  name: string;
}

export interface TodoView {
  id: string;
  title: string;
  note: string | null;
  /** `AAAA-MM-JJ` (Paris day) or null. */
  dueDate: string | null;
  completedAt: Date | null;
  completedBy: TodoUser | null;
  archivedAt: Date | null;
  createdAt: Date;
  owner: TodoUser;
  project: { id: string; name: string; color: ProjectColor } | null;
  person: LinkedPerson | null;
  assignees: (TodoUser & { assignedByName: string | null })[];
  /** The actor's own assignment: who gave her the task (null when she gave it herself). */
  mine: { assignedByName: string | null; position: number } | null;
  commentCount: number;
  /** The actor may edit, reassign, archive (author, or OWNER of the project). */
  canManage: boolean;
}

export interface TodoComment {
  id: string;
  body: string;
  createdAt: Date;
  author: TodoUser;
}

export interface TodoDetail extends TodoView {
  comments: TodoComment[];
}

export interface ProjectMemberView {
  id: string;
  userId: string;
  name: string;
  role: TodoProjectRole;
}

export interface ProjectView {
  id: string;
  name: string;
  description: string | null;
  color: ProjectColor;
  archivedAt: Date | null;
  members: ProjectMemberView[];
  done: number;
  total: number;
  /** The actor is an active OWNER. */
  isOwner: boolean;
}

function personName(p: { firstName: string; lastName: string; usageName: string | null }) {
  return `${p.firstName} ${p.usageName ?? p.lastName}`;
}

/** Linked persons as the actor sees them now (a profile change can hide one). */
async function linkedPersons(
  db: DbOrTx,
  actor: Actor,
  personIds: readonly string[],
): Promise<Map<string, LinkedPerson>> {
  const ids = [...new Set(personIds)];
  const out = new Map<string, LinkedPerson>();
  if (ids.length === 0) return out;
  const [facts, rows] = await Promise.all([
    loadPersonFactsMany(db, ids),
    db.person.findMany({
      where: { id: { in: ids } },
      select: { id: true, ref: true, firstName: true, lastName: true, usageName: true },
    }),
  ]);
  for (const row of rows) {
    const f = facts.get(row.id);
    if (!f || !can(actor, "person.directory.read", { person: f }).allowed) {
      out.set(row.id, { state: "hidden" });
      continue;
    }
    out.set(row.id, {
      state: "visible",
      ref: row.ref,
      name: personName(row),
      canOpen: personPageAccess(actor, f) !== null,
    });
  }
  return out;
}

async function toViews(db: DbOrTx, actor: Actor, rows: readonly TodoRow[]): Promise<TodoView[]> {
  const persons = await linkedPersons(
    db,
    actor,
    rows.flatMap((r) => (r.personId ? [r.personId] : [])),
  );
  const userIds = [
    ...new Set(
      rows.flatMap((r) => [
        ...(r.completedById ? [r.completedById] : []),
        ...r.assignees.flatMap((a) => (a.assignedById ? [a.assignedById] : [])),
      ]),
    ),
  ];
  const users = new Map(
    (
      await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    ).map((u) => [u.id, u.name]),
  );
  const projectOwners = await projectOwnersOf(
    db,
    rows.flatMap((r) => (r.project ? [r.project.id] : [])),
  );
  return rows.map((r) => {
    const mine = r.assignees.find((a) => a.userId === actor.userId);
    const nameOf = (id: string | null) =>
      id === null || id === actor.userId ? null : (users.get(id) ?? null);
    return {
      id: r.id,
      title: r.title,
      note: r.note,
      dueDate: r.dueDate ? isoDay(r.dueDate) : null,
      completedAt: r.completedAt,
      completedBy: r.completedById
        ? { id: r.completedById, name: users.get(r.completedById) ?? "—" }
        : null,
      archivedAt: r.archivedAt,
      createdAt: r.createdAt,
      owner: r.owner,
      project: r.project
        ? { id: r.project.id, name: r.project.name, color: r.project.color }
        : null,
      person: r.personId ? (persons.get(r.personId) ?? { state: "hidden" }) : null,
      assignees: r.assignees.map((a) => ({
        id: a.user.id,
        name: a.user.name,
        assignedByName: nameOf(a.assignedById),
      })),
      mine: mine ? { assignedByName: nameOf(mine.assignedById), position: mine.position } : null,
      commentCount: r._count.comments,
      canManage:
        r.ownerId === actor.userId ||
        (r.project !== null && (projectOwners.get(r.project.id)?.has(actor.userId) ?? false)),
    };
  });
}

async function projectOwnersOf(
  db: DbOrTx,
  projectIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const ids = [...new Set(projectIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.todoProjectMember.findMany({
    where: { projectId: { in: ids }, removedAt: null, role: "OWNER" },
    select: { projectId: true, userId: true },
  });
  const out = new Map<string, Set<string>>();
  for (const r of rows) out.set(r.projectId, (out.get(r.projectId) ?? new Set()).add(r.userId));
  return out;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function doneSince(now: Date): Date {
  return new Date(now.getTime() - RESTORE_WINDOW_DAYS * DAY_MS);
}

/** Sorts open tasks in the actor's own order (position), then by due day, newest first. */
function byMyOrder(a: TodoView, b: TodoView): number {
  const pa = a.mine?.position ?? 0;
  const pb = b.mine?.position ?? 0;
  if (pa !== pb) return pa - pb;
  return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
}

/**
 * « Ma liste »: every task assigned to the actor (projects included), open
 * ones in her own order, then those done in the last 30 days.
 */
export async function listMyTodos(
  db: DbOrTx,
  actor: Actor,
  options: { projectId?: string | null; now?: Date } = {},
): Promise<{ open: TodoView[]; done: TodoView[] }> {
  authorize(actor, "todo.read");
  const now = options.now ?? new Date();
  const rows = await todoRepository(db).assignedTo(actor.userId, {
    doneSince: doneSince(now),
    projectId: options.projectId ?? null,
  });
  const views = await toViews(db, actor, rows);
  return {
    open: views.filter((t) => t.completedAt === null).sort(byMyOrder),
    done: views
      .filter((t) => t.completedAt !== null)
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)),
  };
}

/** « Confiées »: what the actor put in someone else's list, with its state. */
export async function listConfidedTodos(
  db: DbOrTx,
  actor: Actor,
  now: Date = new Date(),
): Promise<TodoView[]> {
  authorize(actor, "todo.read");
  return toViews(db, actor, await todoRepository(db).confidedBy(actor.userId, doneSince(now)));
}

/** Archived tasks of the actor that can still be restored (30 days). */
export async function listRestorableTodos(
  db: DbOrTx,
  actor: Actor,
  now: Date = new Date(),
): Promise<TodoView[]> {
  authorize(actor, "todo.read");
  return toViews(
    db,
    actor,
    await todoRepository(db).archivedOwnedSince(actor.userId, doneSince(now)),
  );
}

/** One task with its comments, or a 404-like error when the actor may not see it. */
export async function getTodo(db: DbOrTx, actor: Actor, todoId: string): Promise<TodoDetail> {
  const facts = await loadTodoFacts(db, todoId);
  if (!facts || !can(actor, "todo.read", { todo: facts }).allowed) {
    throw new DomainError("NOT_FOUND", "Tâche introuvable.");
  }
  const row = await todoRepository(db).withComments(todoId);
  if (!row) throw new DomainError("NOT_FOUND", "Tâche introuvable.");
  const [view] = await toViews(db, actor, [row]);
  if (!view) throw new DomainError("NOT_FOUND", "Tâche introuvable.");
  return { ...view, comments: row.comments };
}

/** Ids of every non-archived task the user may see (mirror of `can`, filtered in SQL). */
export async function visibleTodoIds(
  db: DbOrTx,
  userId: string,
  where: Prisma.Sql = Prisma.sql`TRUE`,
): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM todos t
    WHERE t.archived_at IS NULL AND ${todoVisibleSql(userId)} AND ${where}`;
  return rows.map((r) => r.id);
}

function toProjectView(
  row: ProjectRow,
  progress: { done: number; total: number } | undefined,
  actorId: string,
): ProjectView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    archivedAt: row.archivedAt,
    members: row.members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      role: m.role,
    })),
    done: progress?.done ?? 0,
    total: progress?.total ?? 0,
    isOwner: row.members.some((m) => m.userId === actorId && m.role === "OWNER"),
  };
}

/** The actor's projects (active member), with their progress; archived ones apart. */
export async function listMyProjects(
  db: DbOrTx,
  actor: Actor,
  now: Date = new Date(),
): Promise<{ active: ProjectView[]; archived: ProjectView[] }> {
  authorize(actor, "todo.read");
  const repo = todoRepository(db);
  const [active, archived] = await Promise.all([
    repo.projectsOf(actor.userId),
    repo.projectsOf(actor.userId, { archivedSince: doneSince(now) }),
  ]);
  const progress = await repo.progress(active.map((p) => p.id));
  return {
    active: active.map((p) => toProjectView(p, progress.get(p.id), actor.userId)),
    archived: archived.map((p) => toProjectView(p, undefined, actor.userId)),
  };
}

/** A project page: the project and its non-archived tasks. Not a member: not found. */
export async function getProject(
  db: DbOrTx,
  actor: Actor,
  projectId: string,
): Promise<{ project: ProjectView; todos: TodoView[] }> {
  const facts = await loadProjectFacts(db, projectId);
  if (!facts || !can(actor, "todo.read", { project: facts }).allowed) {
    throw new DomainError("NOT_FOUND", "Projet introuvable.");
  }
  const repo = todoRepository(db);
  const row = await repo.project(projectId);
  if (!row) throw new DomainError("NOT_FOUND", "Projet introuvable.");
  const ids = await visibleTodoIds(db, actor.userId, Prisma.sql`t.project_id = ${projectId}`);
  const rows = await repo.byIds(ids);
  const todos = (await toViews(db, actor, rows)).sort(
    (a, b) =>
      Number(a.completedAt !== null) - Number(b.completedAt !== null) ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const progress = await repo.progress([projectId]);
  return { project: toProjectView(row, progress.get(projectId), actor.userId), todos };
}

/**
 * A person the actor may link a task to (« Ajouter une tâche » on her page):
 * found by readable number, visible in the actor's directory. Otherwise null.
 */
export async function linkablePerson(
  db: DbOrTx,
  actor: Actor,
  ref: string,
): Promise<{ id: string; name: string } | null> {
  const row = await db.person.findUnique({
    where: { ref },
    select: { id: true, firstName: true, lastName: true, usageName: true },
  });
  if (!row) return null;
  const facts = await loadPersonFacts(db, row.id);
  if (!facts || !can(actor, "person.directory.read", { person: facts }).allowed) return null;
  return { id: row.id, name: personName(row) };
}

/** Active responsibles, to confide or share a task, or to add to a project. */
export async function listResponsibles(db: DbOrTx, actor: Actor): Promise<TodoUser[]> {
  authorize(actor, "todo.read");
  return todoRepository(db).activeUsers();
}

/** Open tasks of the actor due today or overdue (navigation badge, home card). */
export async function urgentTodos(
  db: DbOrTx,
  actor: Actor,
  options: { limit?: number; now?: Date } = {},
): Promise<{ count: number; items: TodoView[] }> {
  const today = toParisDay(options.now);
  const where: Prisma.TodoWhereInput = {
    archivedAt: null,
    completedAt: null,
    dueDate: { lte: today },
    assignees: { some: { userId: actor.userId, removedAt: null } },
  };
  const [count, rows] = await Promise.all([
    db.todo.count({ where }),
    options.limit === 0
      ? Promise.resolve([])
      : db.todo.findMany({
          where,
          orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
          take: options.limit ?? 5,
          select: todoSelect,
        }),
  ]);
  return { count, items: await toViews(db, actor, rows) };
}

/** Navigation badge: open tasks due today or late, in the user's list. */
export function countUrgentTodos(db: DbOrTx, userId: string, now?: Date): Promise<number> {
  return db.todo.count({
    where: {
      archivedAt: null,
      completedAt: null,
      dueDate: { lte: toParisDay(now) },
      assignees: { some: { userId, removedAt: null } },
    },
  });
}

/** Person page: the actor's own tasks linked to the person (author or assignee). */
export async function personTodos(db: DbOrTx, actor: Actor, personId: string): Promise<TodoView[]> {
  authorize(actor, "todo.read");
  const rows = await db.todo.findMany({
    where: {
      personId,
      archivedAt: null,
      OR: [
        { ownerId: actor.userId },
        { assignees: { some: { userId: actor.userId, removedAt: null } } },
      ],
    },
    orderBy: [{ completedAt: { sort: "asc", nulls: "first" } }, { dueDate: "asc" }],
    select: todoSelect,
  });
  return toViews(db, actor, rows);
}

// ---------------------------------------------------------------------------
// Notifications (the bell). Deduplicated by (user, dedupeKey); never to oneself.
// ---------------------------------------------------------------------------

interface TodoNotice {
  userId: string;
  title: string;
  body?: string | null;
  href: string;
  dedupeKey: string;
}

async function notify(tx: DbOrTx, actorId: string | null, notices: readonly TodoNotice[]) {
  const rows = notices.filter((n) => n.userId !== actorId);
  if (rows.length === 0) return 0;
  const { count } = await tx.notification.createMany({
    data: rows.map((n) => ({
      userId: n.userId,
      title: n.title,
      body: n.body ?? null,
      href: n.href,
      dedupeKey: n.dedupeKey,
      createdById: actorId,
    })),
    skipDuplicates: true,
  });
  return count;
}

const todoHref = (todoId: string) => `/a-faire?tache=${todoId}`;
const projectHref = (projectId: string) => `/a-faire/projets/${projectId}`;

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Trimmed text, or null when empty. */
function textOrNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

/** Paris calendar day `AAAA-MM-JJ` → `@db.Date` value. */
function toDateColumn(day: string | null | undefined): Date | null | undefined {
  if (day === undefined) return undefined;
  if (day === null) return null;
  return new Date(`${day}T00:00:00.000Z`);
}

async function assertPersonLinkable(db: DbOrTx, actor: Actor, personId: string) {
  const facts = await loadPersonFacts(db, personId);
  if (!facts || !can(actor, "person.directory.read", { person: facts }).allowed) {
    throw new DomainError("NOT_FOUND", "Personne introuvable.");
  }
}

/** Active member ids of a project (with roles). */
async function activeMembers(tx: DbOrTx, projectId: string) {
  return tx.todoProjectMember.findMany({
    where: { projectId, removedAt: null },
    orderBy: { addedAt: "asc" },
    select: { id: true, userId: true, role: true, addedAt: true },
  });
}

/**
 * Who may be put on a task: active responsibles; in a project, its active
 * members only.
 */
async function assertAssignable(tx: DbOrTx, userIds: readonly string[], projectId: string | null) {
  if (userIds.length === 0) return;
  const active = await tx.user.count({ where: { id: { in: [...userIds] }, active: true } });
  if (active !== new Set(userIds).size) {
    throw new DomainError("INVALID_DATA", "Une tâche ne se confie qu'à un responsable actif.");
  }
  if (projectId) {
    const members = new Set((await activeMembers(tx, projectId)).map((m) => m.userId));
    if (userIds.some((id) => !members.has(id))) {
      throw new DomainError(
        "INVALID_DATA",
        "Dans un projet, une tâche ne se confie qu'à ses membres.",
      );
    }
  }
}

/** Top of the user's list: one less than her smallest position. */
async function topPosition(tx: DbOrTx, userId: string): Promise<number> {
  const min = await tx.todoAssignee.aggregate({
    where: { userId, removedAt: null },
    _min: { position: true },
  });
  return (min._min.position ?? 1) - 1;
}

async function addAssignees(
  tx: Tx,
  audit: AuditRecorder,
  actor: Actor,
  todo: { id: string; title: string },
  userIds: readonly string[],
) {
  for (const userId of userIds) {
    const row = await tx.todoAssignee.create({
      data: {
        todoId: todo.id,
        userId,
        assignedById: actor.userId,
        position: await topPosition(tx, userId),
      },
    });
    audit.created("TodoAssignee", row.id, row);
    await notify(tx, actor.userId, [
      {
        userId,
        title: `${actor.name} vous a confié une tâche`,
        body: todo.title,
        href: todoHref(todo.id),
        dedupeKey: `todo:assigned:${row.id}`,
      },
    ]);
  }
}

export interface CreateTodoInput {
  title: string;
  note?: string | null;
  dueDate?: string | null;
  personId?: string | null;
  projectId?: string | null;
  /** Empty or absent: the task goes to its author. Several: a shared task. */
  assigneeIds?: string[];
}

/** Creates a task: in the author's list, or confided to / shared with others. */
export async function createTodo(
  db: DbOrTx,
  actor: Actor,
  input: CreateTodoInput,
): Promise<{ id: string }> {
  const projectId = input.projectId ?? null;
  if (projectId) {
    const facts = await loadProjectFacts(db, projectId);
    if (!facts) throw new DomainError("NOT_FOUND", "Projet introuvable.");
    authorize(actor, "todo.write", { project: facts });
  } else authorize(actor, "todo.write");
  if (input.personId) await assertPersonLinkable(db, actor, input.personId);
  const assigneeIds = [...new Set(input.assigneeIds ?? [])];
  const targets = assigneeIds.length > 0 ? assigneeIds : [actor.userId];

  return withAudit(db, actor, async (tx, audit) => {
    if (projectId) {
      const project = await tx.todoProject.findUnique({
        where: { id: projectId },
        select: { archivedAt: true },
      });
      if (!project || project.archivedAt) {
        throw new DomainError("INVALID_DATA", "Ce projet est archivé.");
      }
    }
    await assertAssignable(tx, targets, projectId);
    const todo = await tx.todo.create({
      data: {
        ownerId: actor.userId,
        projectId,
        title: input.title.trim(),
        note: textOrNull(input.note),
        dueDate: toDateColumn(input.dueDate ?? null) ?? null,
        personId: input.personId ?? null,
      },
    });
    audit.created("Todo", todo.id, todo);
    await addAssignees(tx, audit, actor, todo, targets);
    return { id: todo.id };
  });
}

async function loadManaged(db: DbOrTx, actor: Actor, todoId: string) {
  const facts = await loadTodoFacts(db, todoId);
  if (!facts || !can(actor, "todo.read", { todo: facts }).allowed) {
    throw new DomainError("NOT_FOUND", "Tâche introuvable.");
  }
  authorize(actor, "todo.manage", { todo: facts });
  return facts;
}

async function loadParticipating(db: DbOrTx, actor: Actor, todoId: string) {
  const facts = await loadTodoFacts(db, todoId);
  if (!facts || !can(actor, "todo.write", { todo: facts }).allowed) {
    throw new DomainError("NOT_FOUND", "Tâche introuvable.");
  }
  return facts;
}

export interface UpdateTodoInput {
  todoId: string;
  title?: string;
  note?: string | null;
  dueDate?: string | null;
  personId?: string | null;
  projectId?: string | null;
}

/** Edits a task (author, or OWNER of its project). */
export async function updateTodo(db: DbOrTx, actor: Actor, input: UpdateTodoInput) {
  await loadManaged(db, actor, input.todoId);
  if (input.personId) await assertPersonLinkable(db, actor, input.personId);
  if (input.projectId) {
    const facts = await loadProjectFacts(db, input.projectId);
    if (!facts) throw new DomainError("NOT_FOUND", "Projet introuvable.");
    authorize(actor, "todo.write", { project: facts });
  }
  return withAudit(db, actor, async (tx, audit) => {
    const before = await tx.todo.findUniqueOrThrow({ where: { id: input.todoId } });
    if (before.archivedAt) throw new DomainError("INVALID_DATA", "Cette tâche est archivée.");
    if (input.projectId) {
      const ids = (
        await tx.todoAssignee.findMany({
          where: { todoId: input.todoId, removedAt: null },
          select: { userId: true },
        })
      ).map((a) => a.userId);
      await assertAssignable(tx, ids, input.projectId);
    }
    const data = {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.note !== undefined ? { note: textOrNull(input.note) } : {}),
      ...(input.dueDate !== undefined ? { dueDate: toDateColumn(input.dueDate) } : {}),
      ...(input.personId !== undefined ? { personId: input.personId } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    };
    const after = await tx.todo.update({ where: { id: input.todoId }, data });
    audit.updated("Todo", input.todoId, before, data);
    return { id: after.id };
  });
}

/** Checks or unchecks a task (any participant). A shared task is done once one assignee checks it. */
export async function setTodoCompleted(
  db: DbOrTx,
  actor: Actor,
  input: { todoId: string; completed: boolean },
) {
  await loadParticipating(db, actor, input.todoId);
  return withAudit(db, actor, async (tx, audit) => {
    const before = await tx.todo.findUniqueOrThrow({ where: { id: input.todoId } });
    if (before.archivedAt) throw new DomainError("INVALID_DATA", "Cette tâche est archivée.");
    if ((before.completedAt !== null) === input.completed) return { id: before.id };
    const data = input.completed
      ? { completedAt: new Date(), completedById: actor.userId }
      : { completedAt: null, completedById: null };
    const after = await tx.todo.update({ where: { id: input.todoId }, data });
    audit.updated("Todo", input.todoId, before, data);
    if (input.completed && after.completedAt) {
      await notify(tx, actor.userId, [
        {
          userId: before.ownerId,
          title: `${actor.name} a terminé une tâche`,
          body: before.title,
          href: todoHref(before.id),
          dedupeKey: `todo:done:${before.id}:${after.completedAt.toISOString()}`,
        },
      ]);
    }
    return { id: after.id };
  });
}

/** Saves the actor's own order of these tasks (her list only; others' orders are untouched). */
export async function reorderMyTodos(db: DbOrTx, actor: Actor, input: { todoIds: string[] }) {
  authorize(actor, "todo.write");
  const ids = [...new Set(input.todoIds)];
  return withAudit(db, actor, async (tx, audit) => {
    const rows = await tx.todoAssignee.findMany({
      where: { userId: actor.userId, removedAt: null, todoId: { in: ids } },
      select: { id: true, todoId: true, position: true },
    });
    if (rows.length !== ids.length) {
      throw new DomainError("INVALID_DATA", "Seules les tâches de votre liste se réordonnent.");
    }
    const byTodo = new Map(rows.map((r) => [r.todoId, r]));
    // Keep the slots the group already used, so other groups do not move.
    const slots = rows.map((r) => r.position).sort((a, b) => a - b);
    for (const [index, todoId] of ids.entries()) {
      const row = byTodo.get(todoId);
      const position = slots[index] ?? index;
      if (!row || row.position === position) continue;
      await tx.todoAssignee.update({ where: { id: row.id }, data: { position } });
      audit.updated("TodoAssignee", row.id, { position: row.position }, { position });
    }
    // Ties (several 0) are broken by giving distinct positions in the new order.
    const distinct = new Set(ids.map((_, i) => slots[i]));
    if (distinct.size !== ids.length) {
      const base = slots[0] ?? 0;
      for (const [index, todoId] of ids.entries()) {
        const row = byTodo.get(todoId);
        if (row) {
          await tx.todoAssignee.update({ where: { id: row.id }, data: { position: base + index } });
        }
      }
    }
    return { count: ids.length };
  });
}

/**
 * Sets who has the task (author, or OWNER of its project): adds the new ones
 * (notified), removes the others (`removedAt`). An empty list gives the task
 * back to its author.
 */
export async function setTodoAssignees(
  db: DbOrTx,
  actor: Actor,
  input: { todoId: string; userIds: string[] },
) {
  await loadManaged(db, actor, input.todoId);
  return withAudit(db, actor, async (tx, audit) => {
    const todo = await tx.todo.findUniqueOrThrow({
      where: { id: input.todoId },
      select: { id: true, title: true, ownerId: true, projectId: true, archivedAt: true },
    });
    if (todo.archivedAt) throw new DomainError("INVALID_DATA", "Cette tâche est archivée.");
    const wanted = [...new Set(input.userIds.length > 0 ? input.userIds : [todo.ownerId])];
    await assertAssignable(tx, wanted, todo.projectId);
    const current = await tx.todoAssignee.findMany({
      where: { todoId: todo.id, removedAt: null },
      select: { id: true, userId: true },
    });
    const now = new Date();
    for (const row of current.filter((a) => !wanted.includes(a.userId))) {
      await tx.todoAssignee.update({ where: { id: row.id }, data: { removedAt: now } });
      audit.updated("TodoAssignee", row.id, { removedAt: null }, { removedAt: now });
    }
    const have = new Set(current.map((a) => a.userId));
    await addAssignees(
      tx,
      audit,
      actor,
      todo,
      wanted.filter((id) => !have.has(id)),
    );
    return { id: todo.id };
  });
}

/**
 * « Ce n'est pas pour moi »: the actor leaves the task; its author is told.
 * When nobody is left, the task goes back to its author's list.
 */
export async function withdrawFromTodo(db: DbOrTx, actor: Actor, input: { todoId: string }) {
  await loadParticipating(db, actor, input.todoId);
  return withAudit(db, actor, async (tx, audit) => {
    const todo = await tx.todo.findUniqueOrThrow({
      where: { id: input.todoId },
      select: { id: true, title: true, ownerId: true },
    });
    const mine = await tx.todoAssignee.findFirst({
      where: { todoId: todo.id, userId: actor.userId, removedAt: null },
    });
    if (!mine) throw new DomainError("INVALID_DATA", "Cette tâche n'est pas dans votre liste.");
    const now = new Date();
    await tx.todoAssignee.update({ where: { id: mine.id }, data: { removedAt: now } });
    audit.updated("TodoAssignee", mine.id, { removedAt: null }, { removedAt: now });
    const left = await tx.todoAssignee.count({ where: { todoId: todo.id, removedAt: null } });
    if (left === 0 && todo.ownerId !== actor.userId) {
      const back = await tx.todoAssignee.create({
        data: {
          todoId: todo.id,
          userId: todo.ownerId,
          assignedById: actor.userId,
          position: await topPosition(tx, todo.ownerId),
        },
      });
      audit.created("TodoAssignee", back.id, back);
    }
    await notify(tx, actor.userId, [
      {
        userId: todo.ownerId,
        title: `${actor.name} a refusé une tâche`,
        body:
          left === 0
            ? `${todo.title} — elle revient dans votre liste.`
            : `${todo.title} — « Ce n'est pas pour moi ».`,
        href: todoHref(todo.id),
        dedupeKey: `todo:declined:${mine.id}`,
      },
    ]);
    return { id: todo.id };
  });
}

/** Adds a comment (any participant); the other participants are told. */
export async function commentTodo(
  db: DbOrTx,
  actor: Actor,
  input: { todoId: string; body: string },
) {
  const facts = await loadParticipating(db, actor, input.todoId);
  return withAudit(db, actor, async (tx, audit) => {
    const todo = await tx.todo.findUniqueOrThrow({
      where: { id: input.todoId },
      select: { id: true, title: true },
    });
    const comment = await tx.todoComment.create({
      data: { todoId: todo.id, authorId: actor.userId, body: input.body.trim() },
    });
    audit.created("TodoComment", comment.id, comment);
    const recipients = new Set([facts.ownerId, ...facts.assigneeIds]);
    await notify(
      tx,
      actor.userId,
      [...recipients].map((userId) => ({
        userId,
        title: `${actor.name} a commenté une tâche`,
        body: todo.title,
        href: todoHref(todo.id),
        dedupeKey: `todo:comment:${comment.id}`,
      })),
    );
    return { id: comment.id };
  });
}

/** « Supprimer »: archives the task (author, or OWNER of its project). */
export async function archiveTodo(db: DbOrTx, actor: Actor, input: { todoId: string }) {
  await loadManaged(db, actor, input.todoId);
  return withAudit(db, actor, async (tx, audit) => {
    const before = await tx.todo.findUniqueOrThrow({ where: { id: input.todoId } });
    if (before.archivedAt) return { id: before.id };
    await tx.todo.update({ where: { id: before.id }, data: { archivedAt: new Date() } });
    audit.archived("Todo", before.id);
    return { id: before.id };
  });
}

/** Restores an archived task, within 30 days of its archiving. */
export async function restoreTodo(
  db: DbOrTx,
  actor: Actor,
  input: { todoId: string },
  now: Date = new Date(),
) {
  await loadManaged(db, actor, input.todoId);
  return withAudit(db, actor, async (tx, audit) => {
    const before = await tx.todo.findUniqueOrThrow({ where: { id: input.todoId } });
    if (!before.archivedAt) return { id: before.id };
    if (before.archivedAt < doneSince(now)) {
      throw new DomainError("INVALID_DATA", "Une tâche se restaure dans les 30 jours.");
    }
    await tx.todo.update({ where: { id: before.id }, data: { archivedAt: null } });
    audit.updated("Todo", before.id, { archivedAt: before.archivedAt }, { archivedAt: null });
    return { id: before.id };
  });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  color?: TodoProjectColor;
  /** Other members (the creator is OWNER). */
  memberIds?: string[];
}

export async function createProject(
  db: DbOrTx,
  actor: Actor,
  input: CreateProjectInput,
): Promise<{ id: string }> {
  authorize(actor, "todo.write");
  const others = [...new Set(input.memberIds ?? [])].filter((id) => id !== actor.userId);
  return withAudit(db, actor, async (tx, audit) => {
    await assertAssignable(tx, others, null);
    const project = await tx.todoProject.create({
      data: {
        name: input.name.trim(),
        description: textOrNull(input.description),
        color: input.color ?? "INK",
        ownerId: actor.userId,
      },
    });
    audit.created("TodoProject", project.id, project);
    const owner = await tx.todoProjectMember.create({
      data: { projectId: project.id, userId: actor.userId, role: "OWNER", addedById: actor.userId },
    });
    audit.created("TodoProjectMember", owner.id, owner);
    for (const userId of others) await addMemberRow(tx, audit, actor, project, userId, "MEMBER");
    return { id: project.id };
  });
}

async function addMemberRow(
  tx: Tx,
  audit: AuditRecorder,
  actor: Actor,
  project: { id: string; name: string },
  userId: string,
  role: TodoProjectRole,
) {
  const row = await tx.todoProjectMember.create({
    data: { projectId: project.id, userId, role, addedById: actor.userId },
  });
  audit.created("TodoProjectMember", row.id, row);
  await notify(tx, actor.userId, [
    {
      userId,
      title: `${actor.name} vous a ajouté à un projet`,
      body: project.name,
      href: projectHref(project.id),
      dedupeKey: `todo:project-member:${row.id}`,
    },
  ]);
}

async function loadOwnedProject(db: DbOrTx, actor: Actor, projectId: string) {
  const facts = await loadProjectFacts(db, projectId);
  if (!facts || !can(actor, "todo.read", { project: facts }).allowed) {
    throw new DomainError("NOT_FOUND", "Projet introuvable.");
  }
  authorize(actor, "todo.project.manage", { project: facts });
  return facts;
}

/** Renames, re-describes or recolours a project (OWNER). */
export async function updateProject(
  db: DbOrTx,
  actor: Actor,
  input: {
    projectId: string;
    name?: string;
    description?: string | null;
    color?: TodoProjectColor;
  },
) {
  await loadOwnedProject(db, actor, input.projectId);
  return withAudit(db, actor, async (tx, audit) => {
    const before = await tx.todoProject.findUniqueOrThrow({ where: { id: input.projectId } });
    const data = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: textOrNull(input.description) } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    };
    await tx.todoProject.update({ where: { id: before.id }, data });
    audit.updated("TodoProject", before.id, before, data);
    return { id: before.id };
  });
}

/** Adds a member (OWNER). Only active responsibles. */
export async function addProjectMember(
  db: DbOrTx,
  actor: Actor,
  input: { projectId: string; userId: string; role?: TodoProjectRole },
) {
  await loadOwnedProject(db, actor, input.projectId);
  return withAudit(db, actor, async (tx, audit) => {
    const project = await tx.todoProject.findUniqueOrThrow({
      where: { id: input.projectId },
      select: { id: true, name: true },
    });
    await assertAssignable(tx, [input.userId], null);
    const existing = await tx.todoProjectMember.findFirst({
      where: { projectId: project.id, userId: input.userId, removedAt: null },
    });
    if (existing) return { id: existing.id };
    await addMemberRow(tx, audit, actor, project, input.userId, input.role ?? "MEMBER");
    return { id: project.id };
  });
}

/**
 * Removes a member (OWNER): her membership gets `removedAt`, and so do her
 * assignments on the project's open tasks. At least one OWNER always stays.
 */
export async function removeProjectMember(
  db: DbOrTx,
  actor: Actor,
  input: { projectId: string; userId: string },
) {
  await loadOwnedProject(db, actor, input.projectId);
  return withAudit(db, actor, async (tx, audit) => {
    await tx.$executeRaw`SELECT 1 FROM todo_projects WHERE id = ${input.projectId} FOR UPDATE`;
    const members = await activeMembers(tx, input.projectId);
    const row = members.find((m) => m.userId === input.userId);
    if (!row) return { id: input.projectId };
    if (wouldLeaveNoOwner(members, input.userId)) {
      throw new DomainError("LAST_PROJECT_OWNER", "Un projet garde toujours au moins un OWNER.");
    }
    const now = new Date();
    await tx.todoProjectMember.update({ where: { id: row.id }, data: { removedAt: now } });
    audit.updated("TodoProjectMember", row.id, { removedAt: null }, { removedAt: now });
    const assignments = await tx.todoAssignee.findMany({
      where: {
        userId: input.userId,
        removedAt: null,
        todo: { projectId: input.projectId, completedAt: null },
      },
      select: { id: true },
    });
    for (const a of assignments) {
      await tx.todoAssignee.update({ where: { id: a.id }, data: { removedAt: now } });
      audit.updated("TodoAssignee", a.id, { removedAt: null }, { removedAt: now });
    }
    return { id: input.projectId };
  });
}

/** Changes a member's role (OWNER). At least one OWNER always stays. */
export async function setProjectMemberRole(
  db: DbOrTx,
  actor: Actor,
  input: { projectId: string; userId: string; role: TodoProjectRole },
) {
  await loadOwnedProject(db, actor, input.projectId);
  return withAudit(db, actor, async (tx, audit) => {
    await tx.$executeRaw`SELECT 1 FROM todo_projects WHERE id = ${input.projectId} FOR UPDATE`;
    const members = await activeMembers(tx, input.projectId);
    const row = members.find((m) => m.userId === input.userId);
    if (!row) throw new DomainError("NOT_FOUND", "Ce responsable n'est pas membre du projet.");
    if (row.role === input.role) return { id: row.id };
    if (input.role === "MEMBER" && wouldLeaveNoOwner(members, input.userId)) {
      throw new DomainError("LAST_PROJECT_OWNER", "Un projet garde toujours au moins un OWNER.");
    }
    await tx.todoProjectMember.update({ where: { id: row.id }, data: { role: input.role } });
    audit.updated("TodoProjectMember", row.id, { role: row.role }, { role: input.role });
    return { id: row.id };
  });
}

/** Archives a project (OWNER); its tasks stay where they are. */
export async function archiveProject(db: DbOrTx, actor: Actor, input: { projectId: string }) {
  await loadOwnedProject(db, actor, input.projectId);
  return withAudit(db, actor, async (tx, audit) => {
    const before = await tx.todoProject.findUniqueOrThrow({ where: { id: input.projectId } });
    if (before.archivedAt) return { id: before.id };
    await tx.todoProject.update({ where: { id: before.id }, data: { archivedAt: new Date() } });
    audit.archived("TodoProject", before.id);
    return { id: before.id };
  });
}

/** Restores an archived project, within 30 days. */
export async function restoreProject(
  db: DbOrTx,
  actor: Actor,
  input: { projectId: string },
  now: Date = new Date(),
) {
  await loadOwnedProject(db, actor, input.projectId);
  return withAudit(db, actor, async (tx, audit) => {
    const before = await tx.todoProject.findUniqueOrThrow({ where: { id: input.projectId } });
    if (!before.archivedAt) return { id: before.id };
    if (before.archivedAt < doneSince(now)) {
      throw new DomainError("INVALID_DATA", "Un projet se restaure dans les 30 jours.");
    }
    await tx.todoProject.update({ where: { id: before.id }, data: { archivedAt: null } });
    audit.updated(
      "TodoProject",
      before.id,
      { archivedAt: before.archivedAt },
      { archivedAt: null },
    );
    return { id: before.id };
  });
}

// ---------------------------------------------------------------------------
// System: daily task, account deactivation, GDPR
// ---------------------------------------------------------------------------

/**
 * Daily task: a morning notification for every open task due today, to each
 * active assignee. Replaying the same day notifies nobody twice (dedupeKey).
 */
export async function runTodoDueReminders(db: DbOrTx, day: Date): Promise<number> {
  const rows = await db.todoAssignee.findMany({
    where: {
      removedAt: null,
      user: { active: true },
      todo: { archivedAt: null, completedAt: null, dueDate: day },
    },
    select: { userId: true, todo: { select: { id: true, title: true } } },
  });
  return notify(
    db,
    null,
    rows.map((r) => ({
      userId: r.userId,
      title: "Tâche à faire aujourd'hui",
      body: r.todo.title,
      href: todoHref(r.todo.id),
      dedupeKey: `todo:due:${r.todo.id}:${isoDay(day)}`,
    })),
  );
}

/**
 * A responsible's account is deactivated: her tasks stay; her assignments
 * are removed (tasks she confided stay visible to their assignees); a task
 * left with nobody goes back to its author; for every project where she was
 * the last OWNER, the oldest other member becomes OWNER (traced).
 */
export async function releaseTodosOfUser(tx: Tx, audit: AuditRecorder, userId: string) {
  const now = new Date();
  const assignments = await tx.todoAssignee.findMany({
    where: { userId, removedAt: null },
    select: { id: true, todoId: true, todo: { select: { ownerId: true } } },
  });
  for (const a of assignments) {
    await tx.todoAssignee.update({ where: { id: a.id }, data: { removedAt: now } });
    audit.updated("TodoAssignee", a.id, { removedAt: null }, { removedAt: now });
    const left = await tx.todoAssignee.count({ where: { todoId: a.todoId, removedAt: null } });
    if (left === 0 && a.todo.ownerId !== userId) {
      const back = await tx.todoAssignee.create({
        data: {
          todoId: a.todoId,
          userId: a.todo.ownerId,
          position: await topPosition(tx, a.todo.ownerId),
        },
      });
      audit.created("TodoAssignee", back.id, back);
    }
  }
  const owned = await tx.todoProjectMember.findMany({
    where: { userId, removedAt: null, role: "OWNER" },
    select: { projectId: true },
  });
  for (const { projectId } of owned) {
    const members = await tx.todoProjectMember.findMany({
      where: { projectId, removedAt: null, userId: { not: userId }, user: { active: true } },
      orderBy: { addedAt: "asc" },
      select: { id: true, role: true },
    });
    if (members.some((m) => m.role === "OWNER")) continue;
    const heir = members[0];
    if (!heir) continue;
    await tx.todoProjectMember.update({ where: { id: heir.id }, data: { role: "OWNER" } });
    audit.updated("TodoProjectMember", heir.id, { role: "MEMBER" }, { role: "OWNER" });
  }
}

/** GDPR export of a person: the tasks linked to her (title and dates only). */
export async function todosForGdprExport(db: DbOrTx, personId: string) {
  const rows = await db.todo.findMany({
    where: { personId },
    orderBy: { createdAt: "asc" },
    select: { title: true, dueDate: true, createdAt: true, completedAt: true, archivedAt: true },
  });
  return rows.map((r) => ({
    titre: r.title,
    echeance: r.dueDate ? longDay(isoDay(r.dueDate)) : null,
    creee: r.createdAt.toISOString(),
    terminee: r.completedAt?.toISOString() ?? null,
    archivee: r.archivedAt?.toISOString() ?? null,
  }));
}

/** GDPR purge: the person's tasks are kept, detached from her (`personId` null). */
export async function detachTodosFromPerson(tx: Tx, personId: string): Promise<number> {
  const { count } = await tx.todo.updateMany({ where: { personId }, data: { personId: null } });
  return count;
}
