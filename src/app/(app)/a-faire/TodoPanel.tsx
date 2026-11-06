"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { Archive, LogOut, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/dates";
import { longDay, TODO_COMMENT_MAX, TODO_NOTE_MAX, TODO_TITLE_MAX } from "@/lib/todos";
import type { TodoDetail } from "@/server/services/todos";
import {
  archiveTodoAction,
  commentTodoAction,
  setTodoAssigneesAction,
  todoDetailAction,
  updateTodoAction,
  withdrawFromTodoAction,
} from "./actions";
import type { TodoOption } from "./types";

export interface TodoPanelProps {
  actorId: string;
  responsibles: TodoOption[];
  projects: TodoOption[];
}

/**
 * The task's panel, opened by `?tache=<id>` (a row, a notification): side
 * panel on a computer, full screen on a phone. Note (with the warning about
 * sensitive data), due day, linked person, assignees, comments; « Ce n'est
 * pas pour moi » for an assignee; edit and « Supprimer » (archive, 30 days)
 * for the author or an OWNER of the project.
 */
export function TodoPanel({ actorId, responsibles, projects }: TodoPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const todoId = params.get("tache");
  const [todo, setTodo] = useState<TodoDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("tache");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const load = useCallback(async (id: string) => {
    const result = await todoDetailAction({ todoId: id });
    if (result.ok) {
      setTodo(result.data);
      setLoadError(null);
    } else {
      setTodo(null);
      setLoadError("Cette tâche n'est pas accessible.");
    }
  }, []);

  useEffect(() => {
    setTodo(null);
    setLoadError(null);
    if (todoId) void load(todoId);
  }, [todoId, load]);

  return (
    <Dialog
      open={todoId !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {todoId !== null && (
        <DialogContent
          title={todo?.title ?? (loadError ? "Tâche" : "Chargement…")}
          className="top-0 right-0 left-auto h-dvh w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none sm:w-[30rem] sm:rounded-l-card"
        >
          {loadError && <p className="text-body text-ink-2">{loadError}</p>}
          {!todo && !loadError && (
            <p role="status" className="text-body text-muted">
              Chargement de la tâche…
            </p>
          )}
          {todo && (
            <PanelBody
              key={`${todo.id}-${todo.comments.length}-${String(todo.completedAt)}`}
              todo={todo}
              actorId={actorId}
              responsibles={responsibles}
              projects={projects}
              onChanged={async () => {
                await load(todo.id);
                router.refresh();
              }}
              onClosed={() => {
                close();
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

function PanelBody({
  todo,
  actorId,
  responsibles,
  projects,
  onChanged,
  onClosed,
}: {
  todo: TodoDetail;
  actorId: string;
  responsibles: TodoOption[];
  projects: TodoOption[];
  onChanged: () => Promise<void>;
  onClosed: () => void;
}) {
  const ids = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [title, setTitle] = useState(todo.title);
  const [note, setNote] = useState(todo.note ?? "");
  const [dueDate, setDueDate] = useState(todo.dueDate ?? "");
  const [projectId, setProjectId] = useState(todo.project?.id ?? "");
  const [assignees, setAssignees] = useState(todo.assignees.map((a) => a.id));
  const [comment, setComment] = useState("");
  const mine = todo.mine !== null;
  const project = projects.find((p) => p.id === projectId);
  const choices = project
    ? responsibles.filter((r) => project.memberIds?.includes(r.id))
    : responsibles;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Action impossible.");
        return;
      }
      setError(null);
      if (done) done();
      else {
        setSaved("Enregistré.");
        await onChanged();
      }
    });
  };

  const save = () => {
    run(async () => {
      const update = await updateTodoAction({
        todoId: todo.id,
        title,
        note: note.trim() ? note : null,
        dueDate: dueDate || null,
        projectId: projectId || null,
      });
      if (!update.ok) return update;
      const same =
        assignees.length === todo.assignees.length &&
        assignees.every((id) => todo.assignees.some((a) => a.id === id));
      return same ? update : setTodoAssigneesAction({ todoId: todo.id, userIds: assignees });
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small">
        <dt className="text-muted">Créée par</dt>
        <dd className="text-ink">{todo.owner.id === actorId ? "Vous" : todo.owner.name}</dd>
        {todo.mine?.assignedByName && (
          <>
            <dt className="text-muted">Confiée par</dt>
            <dd className="text-ink">{todo.mine.assignedByName}</dd>
          </>
        )}
        <dt className="text-muted">État</dt>
        <dd className="text-ink">
          {todo.completedAt
            ? `Faite${todo.completedBy ? ` par ${todo.completedBy.id === actorId ? "vous" : todo.completedBy.name}` : ""} le ${formatDateTime(todo.completedAt)}`
            : todo.dueDate
              ? `À faire pour le ${longDay(todo.dueDate)}`
              : "À faire, sans date"}
        </dd>
        {todo.person && (
          <>
            <dt className="text-muted">Personne</dt>
            <dd className="text-ink">
              {todo.person.state === "hidden" ? (
                "Personne non accessible"
              ) : todo.person.canOpen ? (
                <Link
                  href={`/benevoles/${todo.person.ref}`}
                  className="underline underline-offset-4 focus-ring"
                >
                  {todo.person.name}
                </Link>
              ) : (
                todo.person.name
              )}
            </dd>
          </>
        )}
      </dl>

      {todo.canManage ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Field label="Titre" required>
            <Input
              value={title}
              maxLength={TODO_TITLE_MAX}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
            />
          </Field>
          <Field
            label="Note"
            hint="N'écrivez pas de donnée de santé ni d'information sensible ici."
          >
            <Textarea
              value={note}
              rows={4}
              maxLength={TODO_NOTE_MAX}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          </Field>
          <Field label="Échéance">
            <Input
              type="date"
              value={dueDate}
              onChange={(event) => {
                setDueDate(event.target.value);
              }}
            />
          </Field>
          <Field label="Projet">
            <Select
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
              }}
            >
              <option value="">Aucun projet</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-small font-medium text-ink">
              Dans la liste de (plusieurs : tâche partagée)
            </legend>
            <div className="flex max-h-56 flex-col overflow-y-auto">
              {choices.map((r) => (
                <Checkbox
                  key={r.id}
                  label={r.id === actorId ? `${r.name} (vous)` : r.name}
                  checked={assignees.includes(r.id)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setAssignees((list) =>
                      checked ? [...list, r.id] : list.filter((x) => x !== r.id),
                    );
                  }}
                />
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending}>
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="outline"
              leftIcon={<Archive />}
              disabled={pending}
              onClick={() => {
                run(() => archiveTodoAction({ todoId: todo.id }), onClosed);
              }}
            >
              Supprimer
            </Button>
          </div>
        </form>
      ) : (
        todo.note && (
          <section aria-labelledby={`${ids}-note`} className="flex flex-col gap-1">
            <h3 id={`${ids}-note`} className="text-small font-medium text-muted">
              Note
            </h3>
            <p className="text-body whitespace-pre-line text-ink">{todo.note}</p>
          </section>
        )
      )}

      {!todo.canManage && (
        <p className="text-small text-ink-2">
          Dans la liste de :{" "}
          {todo.assignees.map((a) => (a.id === actorId ? "vous" : a.name)).join(", ")}
        </p>
      )}

      {mine && todo.owner.id !== actorId && (
        <Button
          type="button"
          variant="outline"
          leftIcon={<LogOut />}
          disabled={pending}
          onClick={() => {
            run(() => withdrawFromTodoAction({ todoId: todo.id }), onClosed);
          }}
          className="self-start"
        >
          Ce n&apos;est pas pour moi
        </Button>
      )}

      {error && (
        <p role="alert" className="text-small font-medium text-danger-ink">
          {error}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {saved}
      </p>

      <section
        aria-labelledby={`${ids}-comments`}
        className="flex flex-col gap-3 border-t border-line pt-5"
      >
        <h3 id={`${ids}-comments`} className="text-section text-ink">
          Commentaires
        </h3>
        {todo.comments.length === 0 ? (
          <p className="text-small text-muted">Aucun commentaire.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todo.comments.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 rounded-inner bg-veil/60 px-4 py-3">
                <span className="text-small text-muted">
                  {c.author.id === actorId ? "Vous" : c.author.name} · {formatDateTime(c.createdAt)}
                </span>
                <span className="text-body whitespace-pre-line text-ink">{c.body}</span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!comment.trim()) return;
            run(async () => {
              const result = await commentTodoAction({ todoId: todo.id, body: comment });
              if (result.ok) setComment("");
              return result;
            });
          }}
        >
          <Field
            label="Ajouter un commentaire"
            hint="N'écrivez pas de donnée de santé ni d'information sensible ici."
          >
            <Textarea
              value={comment}
              rows={2}
              maxLength={TODO_COMMENT_MAX}
              onChange={(event) => {
                setComment(event.target.value);
              }}
            />
          </Field>
          <Button
            type="submit"
            variant="outline"
            leftIcon={<Send />}
            disabled={pending}
            className="self-start"
          >
            Commenter
          </Button>
        </form>
      </section>
    </div>
  );
}
