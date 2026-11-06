import type { Prisma } from "@/generated/prisma/client";
import type { DbOrTx } from "../db";

/**
 * Read access to the « À faire » tables (step 16). The service decides who
 * may see what; these queries only shape the rows. Archived rows are left
 * out unless asked.
 */

export const todoSelect = {
  id: true,
  title: true,
  note: true,
  dueDate: true,
  personId: true,
  completedAt: true,
  completedById: true,
  archivedAt: true,
  createdAt: true,
  ownerId: true,
  owner: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, color: true, archivedAt: true } },
  assignees: {
    where: { removedAt: null },
    orderBy: { assignedAt: "asc" },
    select: {
      id: true,
      userId: true,
      position: true,
      assignedById: true,
      user: { select: { id: true, name: true } },
    },
  },
  _count: { select: { comments: { where: { archivedAt: null } } } },
} satisfies Prisma.TodoSelect;

export type TodoRow = Prisma.TodoGetPayload<{ select: typeof todoSelect }>;

export const projectSelect = {
  id: true,
  name: true,
  description: true,
  color: true,
  archivedAt: true,
  createdAt: true,
  members: {
    where: { removedAt: null },
    orderBy: { addedAt: "asc" },
    select: { id: true, userId: true, role: true, addedAt: true, user: { select: { name: true } } },
  },
} satisfies Prisma.TodoProjectSelect;

export type ProjectRow = Prisma.TodoProjectGetPayload<{ select: typeof projectSelect }>;

export function todoRepository(db: DbOrTx) {
  return {
    /** Tasks in the user's own list (active assignment), open, then done since `doneSince`. */
    async assignedTo(
      userId: string,
      options: { doneSince: Date; projectId?: string | null },
    ): Promise<TodoRow[]> {
      return db.todo.findMany({
        where: {
          archivedAt: null,
          assignees: { some: { userId, removedAt: null } },
          ...(options.projectId ? { projectId: options.projectId } : {}),
          OR: [{ completedAt: null }, { completedAt: { gte: options.doneSince } }],
        },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        select: todoSelect,
      });
    },

    /** Tasks the user created and put in someone else's list. */
    async confidedBy(userId: string, doneSince: Date): Promise<TodoRow[]> {
      return db.todo.findMany({
        where: {
          ownerId: userId,
          archivedAt: null,
          assignees: { some: { removedAt: null, userId: { not: userId } } },
          OR: [{ completedAt: null }, { completedAt: { gte: doneSince } }],
        },
        orderBy: [{ completedAt: { sort: "asc", nulls: "first" } }, { dueDate: "asc" }],
        select: todoSelect,
      });
    },

    /** Tasks of these ids, in no particular order. */
    async byIds(ids: readonly string[]): Promise<TodoRow[]> {
      if (ids.length === 0) return [];
      return db.todo.findMany({ where: { id: { in: [...ids] } }, select: todoSelect });
    },

    /** One task with its comments. */
    async withComments(id: string) {
      return db.todo.findUnique({
        where: { id },
        select: {
          ...todoSelect,
          comments: {
            where: { archivedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              body: true,
              createdAt: true,
              author: { select: { id: true, name: true } },
            },
          },
        },
      });
    },

    /** Archived tasks the user manages, still restorable (since `since`). */
    async archivedOwnedSince(userId: string, since: Date): Promise<TodoRow[]> {
      return db.todo.findMany({
        where: { ownerId: userId, archivedAt: { gte: since } },
        orderBy: { archivedAt: "desc" },
        select: todoSelect,
      });
    },

    /** Projects of which the user is an active member. */
    async projectsOf(
      userId: string,
      options: { archivedSince?: Date } = {},
    ): Promise<ProjectRow[]> {
      return db.todoProject.findMany({
        where: {
          members: { some: { userId, removedAt: null } },
          archivedAt: options.archivedSince ? { gte: options.archivedSince } : null,
        },
        orderBy: { name: "asc" },
        select: projectSelect,
      });
    },

    async project(id: string): Promise<ProjectRow | null> {
      return db.todoProject.findUnique({ where: { id }, select: projectSelect });
    },

    /** Done / total of the non-archived tasks of each project. */
    async progress(
      projectIds: readonly string[],
    ): Promise<Map<string, { done: number; total: number }>> {
      const rows = await db.todo.groupBy({
        by: ["projectId"],
        where: { projectId: { in: [...projectIds] }, archivedAt: null },
        _count: { _all: true, completedAt: true },
      });
      return new Map(
        rows.map((r) => [r.projectId ?? "", { done: r._count.completedAt, total: r._count._all }]),
      );
    },

    /** Active responsibles (accounts that can sign in), for confiding and sharing. */
    async activeUsers(): Promise<{ id: string; name: string }[]> {
      return db.user.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
    },
  };
}
