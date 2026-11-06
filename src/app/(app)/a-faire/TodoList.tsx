"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Toast } from "@/components/ui/Toast";
import {
  groupTodos,
  moveInOrder,
  TODO_GROUP_LABELS,
  TODO_GROUPS,
  type TodoGroup,
} from "@/lib/todos";
import type { TodoView } from "@/server/services/todos";
import { reorderTodosAction, setTodoCompletedAction } from "./actions";
import { TodoRow } from "./TodoRow";

export interface TodoListProps {
  /** Open tasks, in the order to show. */
  open: TodoView[];
  /** Done tasks (last 30 days), shown folded under « Terminées ». */
  done?: TodoView[];
  today: string;
  actorId: string;
  /**
   * `groups`: « Ma liste » (En retard, Aujourd'hui, Cette semaine, Plus tard,
   * Sans date), reorderable; `flat`: one list (project, confided).
   */
  layout?: "groups" | "flat";
  confidedView?: boolean;
  /** Heading level of the group titles. */
  headingLevel?: 2 | 3;
  emptyLabel?: string;
}

/**
 * A list of tasks with its interactions: check with a 5 s « Annuler » toast,
 * reorder inside a group by drag and drop or by the « Monter / Descendre »
 * menu (keyboard), done tasks folded.
 */
export function TodoList({
  open,
  done = [],
  today,
  actorId,
  layout = "groups",
  confidedView = false,
  headingLevel = 2,
  emptyLabel,
}: TodoListProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [order, setOrder] = useState<string[]>(open.map((t) => t.id));
  const [dragged, setDragged] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A refresh brings new data: start again from it.
  const openKey = open.map((t) => t.id).join(",");
  useEffect(() => {
    setOrder(openKey ? openKey.split(",") : []);
    setOverrides({});
  }, [openKey]);

  const byId = new Map([...open, ...done].map((t) => [t.id, t]));
  const isDone = (t: TodoView) => overrides[t.id] ?? t.completedAt !== null;
  const ordered = order.flatMap((id) => {
    const t = byId.get(id);
    return t ? [t] : [];
  });

  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  const toggle = useCallback(
    (todo: TodoView) => {
      const completed = !(overrides[todo.id] ?? todo.completedAt !== null);
      setOverrides((o) => ({ ...o, [todo.id]: completed }));
      if (completed) setJustDone(todo.id);
      startTransition(async () => {
        const result = await setTodoCompletedAction({ todoId: todo.id, completed });
        if (!result.ok) {
          setOverrides((o) => ({ ...o, [todo.id]: !completed }));
          setError(result.error);
          return;
        }
        setError(null);
        setToast({
          message: completed ? "Tâche terminée." : "Tâche rouverte.",
          undo: () => {
            setOverrides((o) => ({ ...o, [todo.id]: !completed }));
            startTransition(async () => {
              await setTodoCompletedAction({ todoId: todo.id, completed: !completed });
              router.refresh();
            });
          },
        });
        router.refresh();
      });
    },
    [overrides, router],
  );

  const saveOrder = (ids: string[]) => {
    startTransition(async () => {
      const result = await reorderTodosAction({ todoIds: ids });
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  };

  const renderRows = (items: TodoView[], reorderable: boolean) =>
    items.map((todo, index) => {
      const view = { ...todo, completedAt: isDone(todo) ? (todo.completedAt ?? new Date()) : null };
      const groupIds = items.map((t) => t.id);
      return (
        <TodoRow
          key={todo.id}
          todo={view}
          today={today}
          actorId={actorId}
          onToggle={toggle}
          confidedView={confidedView}
          justDone={justDone === todo.id}
          {...(reorderable
            ? {
                draggable: true,
                canMoveUp: index > 0,
                canMoveDown: index < items.length - 1,
                onMove: (t: TodoView, step: -1 | 1) => {
                  const next = moveInOrder(groupIds, t.id, step);
                  setOrder((all) => replaceGroup(all, groupIds, next));
                  saveOrder(next);
                },
                onDragStart: (t: TodoView) => {
                  setDragged(t.id);
                },
                onDropOn: (target: TodoView) => {
                  if (!dragged || dragged === target.id || !groupIds.includes(dragged)) return;
                  const without = groupIds.filter((id) => id !== dragged);
                  without.splice(without.indexOf(target.id), 0, dragged);
                  setOrder((all) => replaceGroup(all, groupIds, without));
                  setDragged(null);
                  saveOrder(without);
                },
              }
            : {})}
        />
      );
    });

  const Heading = headingLevel === 2 ? "h2" : "h3";
  const visibleOpen = ordered.filter((t) => byId.has(t.id));

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p
          role="alert"
          className="rounded-inner bg-danger-soft px-4 py-3 text-small text-danger-ink"
        >
          {error}
        </p>
      )}
      {visibleOpen.length === 0 && done.length === 0 && emptyLabel && (
        <p className="text-body text-muted">{emptyLabel}</p>
      )}
      {layout === "groups"
        ? TODO_GROUPS.map((group: TodoGroup) => {
            const items = groupTodos(visibleOpen, today)[group];
            if (items.length === 0) return null;
            return (
              <section
                key={group}
                aria-labelledby={`group-${group}`}
                className="flex flex-col gap-2"
              >
                <Heading
                  id={`group-${group}`}
                  className="flex items-center gap-2 text-section text-ink"
                >
                  {TODO_GROUP_LABELS[group]}
                  <span className="text-body font-normal text-muted tabular-nums">
                    {items.length}
                  </span>
                </Heading>
                <ul className="flex flex-col gap-1">{renderRows(items, true)}</ul>
              </section>
            );
          })
        : visibleOpen.length > 0 && (
            <ul className="flex flex-col gap-1">{renderRows(visibleOpen, false)}</ul>
          )}
      {done.length > 0 && (
        <details className="group/done rounded-card">
          <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control text-section text-ink focus-ring">
            Terminées
            <span className="text-body font-normal text-muted tabular-nums">{done.length}</span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1">{renderRows(done, false)}</ul>
        </details>
      )}
      {toast && (
        <Toast
          message={toast.message}
          {...(toast.undo ? { actionLabel: "Annuler", onAction: toast.undo } : {})}
          onClose={closeToast}
        />
      )}
    </div>
  );
}

/** Puts `next` (a reordered group) back in the whole order, in the group's slots. */
function replaceGroup(all: string[], group: string[], next: string[]): string[] {
  const slots = all.flatMap((id, i) => (group.includes(id) ? [i] : []));
  const out = [...all];
  slots.forEach((slot, i) => {
    const id = next[i];
    if (id !== undefined) out[slot] = id;
  });
  return out;
}
