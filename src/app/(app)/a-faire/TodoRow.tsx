"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { IconButton } from "@/components/ui/IconButton";
import { StatusDot } from "@/components/ui/StatusDot";
import { cn } from "@/lib/cn";
import { PROJECT_COLOR_DOT, shortDay } from "@/lib/todos";
import type { TodoView } from "@/server/services/todos";

export interface TodoRowProps {
  todo: TodoView;
  today: string;
  actorId: string;
  /** Checks or unchecks the task (the list shows the undo toast). */
  onToggle: (todo: TodoView) => void;
  /** Reordering inside its group: buttons (keyboard) and drag and drop. */
  onMove?: (todo: TodoView, step: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  draggable?: boolean;
  onDragStart?: (todo: TodoView) => void;
  onDropOn?: (todo: TodoView) => void;
  /** « Confiées »: show who has it and its state instead of « confiée par ». */
  confidedView?: boolean;
  /** Just checked: a short tick animation (none under reduced motion). */
  justDone?: boolean;
}

function splitName(name: string): [string, string] {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  return [first, rest.join(" ")];
}

/**
 * One task: a 44 px check button, the title (opens the side panel), its due
 * day (JJ/MM) with a dot and label when late or today, the project chip, the
 * linked person, the assignees' avatars when not only me, the comment count.
 */
export function TodoRow({
  todo,
  today,
  actorId,
  onToggle,
  onMove,
  canMoveUp = false,
  canMoveDown = false,
  draggable = false,
  onDragStart,
  onDropOn,
  confidedView = false,
  justDone = false,
}: TodoRowProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const done = todo.completedAt !== null;
  const late = !done && todo.dueDate !== null && todo.dueDate < today;
  const dueToday = !done && todo.dueDate === today;
  const others = todo.assignees.filter((a) => a.id !== actorId);
  const showAvatars = confidedView || others.length > 0;
  const panel = new URLSearchParams(params.toString());
  panel.set("tache", todo.id);

  return (
    <li
      className={cn(
        "group flex items-start gap-2 rounded-inner bg-surface py-1 pr-1 pl-1 sm:gap-3",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.(todo);
      }}
      onDragOver={(event) => {
        if (draggable) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropOn?.(todo);
      }}
      data-testid="todo-row"
      data-todo-id={todo.id}
    >
      {draggable && (
        <GripVertical
          aria-hidden="true"
          className="mt-3.5 hidden size-4 shrink-0 text-muted opacity-0 group-hover:opacity-100 sm:block"
        />
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? "Rouvrir" : "Terminer"} : ${todo.title}`}
        onClick={() => {
          onToggle(todo);
        }}
        className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-pill focus-ring"
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-pill border-2 transition-colors duration-200 motion-reduce:transition-none",
            done
              ? "border-ink bg-ink text-white"
              : "border-line bg-surface text-transparent hover:border-ink",
            justDone && "motion-safe:animate-[todo-tick_0.35s_var(--ease-swiss)]",
          )}
        >
          <Check className="size-4" strokeWidth={3} />
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1 py-2">
        <Link
          href={`${pathname}?${panel.toString()}`}
          scroll={false}
          className={cn(
            "rounded-mark text-body font-medium underline-offset-4 focus-ring hover:underline",
            done ? "text-muted line-through" : "text-ink",
          )}
        >
          {todo.title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-2">
          {todo.dueDate && (
            <span
              className="font-mono tabular-nums"
              aria-label={`Échéance ${shortDay(todo.dueDate)}`}
            >
              {shortDay(todo.dueDate)}
            </span>
          )}
          {late && <StatusDot status="todo-late" />}
          {dueToday && <StatusDot status="todo-today" />}
          {todo.project && (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn("size-2 rounded-pill", PROJECT_COLOR_DOT[todo.project.color])}
              />
              {todo.project.name}
            </span>
          )}
          {todo.person &&
            (todo.person.state === "hidden" ? (
              <span className="text-muted">Personne non accessible</span>
            ) : (
              <span>{todo.person.name}</span>
            ))}
          {!confidedView && todo.mine?.assignedByName && (
            <span className="text-muted">Confiée par {todo.mine.assignedByName}</span>
          )}
          {confidedView && done && todo.completedBy && (
            <span className="text-muted">Faite par {todo.completedBy.name}</span>
          )}
          {todo.commentCount > 0 && (
            <span
              className="inline-flex items-center gap-1"
              aria-label={`${String(todo.commentCount)} commentaire${todo.commentCount > 1 ? "s" : ""}`}
            >
              <MessageSquare aria-hidden="true" className="size-3.5" />
              {todo.commentCount}
            </span>
          )}
        </div>
      </div>

      {showAvatars && (
        <ul className="mt-2.5 hidden shrink-0 gap-1 sm:flex" aria-label="Dans la liste de">
          {todo.assignees.slice(0, 4).map((a) => {
            const [first, last] = splitName(a.name);
            return (
              <li key={a.id}>
                <Avatar
                  firstName={first}
                  lastName={last}
                  size="sm"
                  className="ring-2 ring-surface"
                />
              </li>
            );
          })}
        </ul>
      )}

      {onMove && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label={`Déplacer : ${todo.title}`}
              variant="surface"
              className="shrink-0"
            >
              <MoreHorizontal className="size-5" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!canMoveUp}
              onSelect={() => {
                onMove(todo, -1);
              }}
            >
              <ArrowUp />
              Monter
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canMoveDown}
              onSelect={() => {
                onMove(todo, 1);
              }}
            >
              <ArrowDown />
              Descendre
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
