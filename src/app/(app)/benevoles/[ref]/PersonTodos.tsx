import Link from "next/link";
import { ListPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { toParisDay } from "@/lib/dates";
import { isoDay, shortDay } from "@/lib/todos";
import { getDb } from "@/server/db";
import type { Actor } from "@/server/policy/types";
import { personTodos } from "@/server/services/todos";

/**
 * « Mes tâches liées » on a person page (step 16): only the actor's own tasks
 * linked to the person (author or assignee), and « Ajouter une tâche », which
 * opens « À faire » with the link filled in.
 */
export async function PersonTodos({
  actor,
  personId,
  personRef,
}: {
  actor: Actor;
  personId: string;
  personRef: string;
}) {
  const todos = await personTodos(getDb(), actor, personId);
  const today = isoDay(toParisDay());
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle as="h2">Mes tâches liées</CardTitle>
        <Link
          href={`/a-faire?personne=${encodeURIComponent(personRef)}`}
          className="inline-flex min-h-11 press items-center gap-2 rounded-control border border-ink bg-surface px-5 text-body font-medium text-ink focus-ring hover:bg-veil"
        >
          <ListPlus aria-hidden="true" className="size-4" />
          Ajouter une tâche
        </Link>
      </CardHeader>
      <CardContent>
        {todos.length === 0 ? (
          <p className="text-body text-muted">Aucune de vos tâches ne concerne cette personne.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todos.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-inner bg-veil/60 px-4 py-1"
              >
                <Link
                  href={`/a-faire?tache=${t.id}`}
                  className={
                    t.completedAt
                      ? "inline-flex min-h-11 items-center text-body text-muted line-through focus-ring"
                      : "inline-flex min-h-11 items-center text-body font-medium text-ink underline-offset-4 focus-ring hover:underline"
                  }
                >
                  {t.title}
                </Link>
                <span className="flex items-center gap-3 text-small text-ink-2">
                  {t.dueDate && (
                    <span className="font-mono tabular-nums">{shortDay(t.dueDate)}</span>
                  )}
                  {!t.completedAt && t.dueDate && t.dueDate < today && (
                    <StatusDot status="todo-late" />
                  )}
                  {!t.completedAt && t.dueDate === today && <StatusDot status="todo-today" />}
                  {t.completedAt && <span>Faite</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
