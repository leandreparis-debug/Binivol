import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDot } from "@/components/ui/StatusDot";
import { toParisDay } from "@/lib/dates";
import { isoDay, shortDay } from "@/lib/todos";
import { getDb } from "@/server/db";
import type { Actor } from "@/server/policy/types";
import { urgentTodos } from "@/server/services/todos";

/**
 * Home card « Mes tâches » (step 16): the actor's tasks late or due today,
 * five at most, and a link to « À faire ». A plain card: the screen's single
 * highlighted figure stays the dashboard's.
 */
export async function MyTodosCard({ actor }: { actor: Actor }) {
  const { count, items } = await urgentTodos(getDb(), actor, { limit: 5 });
  const today = isoDay(toParisDay());
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" id="mes-taches">
          Mes tâches
        </CardTitle>
        {count > 0 && (
          <span className="text-small text-muted tabular-nums">
            {count} en retard ou pour aujourd&apos;hui
          </span>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.length === 0 ? (
          <EmptyState
            icon={<ListChecks />}
            title="Rien en retard ni pour aujourd'hui"
            description="Vos tâches du jour s'afficheront ici."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-inner bg-veil/60 px-4 py-1"
              >
                <Link
                  href={`/a-faire?tache=${t.id}`}
                  className="inline-flex min-h-11 items-center text-body font-semibold text-ink underline-offset-4 focus-ring hover:underline"
                >
                  {t.title}
                </Link>
                <span className="flex items-center gap-3 text-small text-ink-2">
                  {t.dueDate && (
                    <span className="font-mono tabular-nums">{shortDay(t.dueDate)}</span>
                  )}
                  <StatusDot
                    status={t.dueDate !== null && t.dueDate < today ? "todo-late" : "todo-today"}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/a-faire"
          className="inline-flex min-h-11 items-center gap-2 self-start text-small font-medium text-ink underline-offset-4 focus-ring hover:underline"
        >
          Toutes mes tâches <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
