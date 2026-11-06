import type { DbOrTx } from "../db";
import type { TodoFacts, TodoProjectFacts } from "./types";

/**
 * Facts of the « À faire » rules (step 16), read from the database for
 * `can()`. Only active links count: an assignment or a membership whose
 * `removedAt` is set gives nothing any more.
 */

/** Facts of a project, or null when it does not exist. */
export async function loadProjectFacts(
  db: DbOrTx,
  projectId: string,
): Promise<TodoProjectFacts | null> {
  const project = await db.todoProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      members: { where: { removedAt: null }, select: { userId: true, role: true } },
    },
  });
  if (!project) return null;
  return {
    projectId: project.id,
    memberIds: project.members.map((m) => m.userId),
    ownerIds: project.members.filter((m) => m.role === "OWNER").map((m) => m.userId),
  };
}

/** Facts of a task, or null when it does not exist. */
export async function loadTodoFacts(db: DbOrTx, todoId: string): Promise<TodoFacts | null> {
  const todo = await db.todo.findUnique({
    where: { id: todoId },
    select: {
      id: true,
      ownerId: true,
      assignees: { where: { removedAt: null }, select: { userId: true } },
      project: {
        select: {
          members: { where: { removedAt: null }, select: { userId: true, role: true } },
        },
      },
    },
  });
  if (!todo) return null;
  const members = todo.project?.members ?? [];
  return {
    todoId: todo.id,
    ownerId: todo.ownerId,
    assigneeIds: todo.assignees.map((a) => a.userId),
    projectMemberIds: members.map((m) => m.userId),
    projectOwnerIds: members.filter((m) => m.role === "OWNER").map((m) => m.userId),
  };
}
