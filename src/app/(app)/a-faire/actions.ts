"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  PROJECT_COLORS,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  TODO_COMMENT_MAX,
  TODO_NOTE_MAX,
  TODO_TITLE_MAX,
} from "@/lib/todos";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { loadProjectFacts, loadTodoFacts } from "@/server/policy/todoFacts";
import {
  addProjectMember,
  archiveProject,
  archiveTodo,
  commentTodo,
  createProject,
  createTodo,
  getTodo,
  removeProjectMember,
  reorderMyTodos,
  restoreProject,
  restoreTodo,
  setProjectMemberRole,
  setTodoAssignees,
  setTodoCompleted,
  updateProject,
  updateTodo,
  withdrawFromTodo,
} from "@/server/services/todos";

/*
 * « À faire » (step 16). Every rule is checked by the service with the facts
 * of the task or project (`can()`, relational conditions); the resource given
 * here is the same, so a refusal stops before any write.
 */

const id = z.string().min(1).max(40);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")
  .nullable();
const title = z.string().trim().min(1, "Titre obligatoire.").max(TODO_TITLE_MAX);
const note = z.string().max(TODO_NOTE_MAX).nullable();
const projectName = z.string().trim().min(1, "Nom obligatoire.").max(PROJECT_NAME_MAX);
const color = z.enum(PROJECT_COLORS);
const role = z.enum(["OWNER", "MEMBER"]);

function refresh(): void {
  revalidatePath("/a-faire", "layout");
  revalidatePath("/", "layout");
}

const todoResource = async ({ todoId }: { todoId: string }) => {
  const todo = await loadTodoFacts(getDb(), todoId);
  return todo ? { todo } : {};
};

const projectResource = async ({ projectId }: { projectId: string }) => {
  const project = await loadProjectFacts(getDb(), projectId);
  return project ? { project } : {};
};

export const createTodoAction = defineAction({
  action: "todo.write",
  input: z.object({
    title,
    note: note.optional(),
    dueDate: day.optional(),
    personId: id.nullable().optional(),
    projectId: id.nullable().optional(),
    assigneeIds: z.array(id).max(20).optional(),
  }),
  handler: async ({ input, actor }) => {
    const result = await createTodo(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const updateTodoAction = defineAction({
  action: "todo.manage",
  input: z.object({
    todoId: id,
    title: title.optional(),
    note: note.optional(),
    dueDate: day.optional(),
    personId: id.nullable().optional(),
    projectId: id.nullable().optional(),
  }),
  resource: todoResource,
  handler: async ({ input, actor }) => {
    const result = await updateTodo(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const setTodoCompletedAction = defineAction({
  action: "todo.write",
  input: z.object({ todoId: id, completed: z.boolean() }),
  resource: todoResource,
  handler: async ({ input, actor }) => {
    const result = await setTodoCompleted(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const reorderTodosAction = defineAction({
  action: "todo.write",
  input: z.object({ todoIds: z.array(id).min(1).max(500) }),
  handler: async ({ input, actor }) => {
    const result = await reorderMyTodos(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const setTodoAssigneesAction = defineAction({
  action: "todo.manage",
  input: z.object({ todoId: id, userIds: z.array(id).max(20) }),
  resource: todoResource,
  handler: async ({ input, actor }) => {
    const result = await setTodoAssignees(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const withdrawFromTodoAction = defineAction({
  action: "todo.write",
  input: z.object({ todoId: id }),
  resource: todoResource,
  handler: async ({ input, actor }) => {
    const result = await withdrawFromTodo(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const commentTodoAction = defineAction({
  action: "todo.write",
  input: z.object({
    todoId: id,
    body: z.string().trim().min(1, "Commentaire vide.").max(TODO_COMMENT_MAX),
  }),
  resource: todoResource,
  handler: async ({ input, actor }) => {
    const result = await commentTodo(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const archiveTodoAction = defineAction({
  action: "todo.manage",
  input: z.object({ todoId: id }),
  resource: todoResource,
  handler: async ({ input, actor }) => {
    const result = await archiveTodo(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const restoreTodoAction = defineAction({
  action: "todo.manage",
  input: z.object({ todoId: id }),
  resource: todoResource,
  handler: async ({ input, actor }) => {
    const result = await restoreTodo(getDb(), actor, input);
    refresh();
    return result;
  },
});

/** The side panel (note, comments) loads on demand. */
export const todoDetailAction = defineAction({
  action: "todo.read",
  input: z.object({ todoId: id }),
  resource: todoResource,
  handler: async ({ input, actor }) => getTodo(getDb(), actor, input.todoId),
});

export const createProjectAction = defineAction({
  action: "todo.write",
  input: z.object({
    name: projectName,
    description: z.string().max(PROJECT_DESCRIPTION_MAX).nullable().optional(),
    color: color.optional(),
    memberIds: z.array(id).max(30).optional(),
  }),
  handler: async ({ input, actor }) => {
    const result = await createProject(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const updateProjectAction = defineAction({
  action: "todo.project.manage",
  input: z.object({
    projectId: id,
    name: projectName.optional(),
    description: z.string().max(PROJECT_DESCRIPTION_MAX).nullable().optional(),
    color: color.optional(),
  }),
  resource: projectResource,
  handler: async ({ input, actor }) => {
    const result = await updateProject(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const addProjectMemberAction = defineAction({
  action: "todo.project.manage",
  input: z.object({ projectId: id, userId: id, role: role.optional() }),
  resource: projectResource,
  handler: async ({ input, actor }) => {
    const result = await addProjectMember(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const removeProjectMemberAction = defineAction({
  action: "todo.project.manage",
  input: z.object({ projectId: id, userId: id }),
  resource: projectResource,
  handler: async ({ input, actor }) => {
    const result = await removeProjectMember(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const setProjectMemberRoleAction = defineAction({
  action: "todo.project.manage",
  input: z.object({ projectId: id, userId: id, role }),
  resource: projectResource,
  handler: async ({ input, actor }) => {
    const result = await setProjectMemberRole(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const archiveProjectAction = defineAction({
  action: "todo.project.manage",
  input: z.object({ projectId: id }),
  resource: projectResource,
  handler: async ({ input, actor }) => {
    const result = await archiveProject(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const restoreProjectAction = defineAction({
  action: "todo.project.manage",
  input: z.object({ projectId: id }),
  resource: projectResource,
  handler: async ({ input, actor }) => {
    const result = await restoreProject(getDb(), actor, input);
    refresh();
    return result;
  },
});
