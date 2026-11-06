import type { Metadata } from "next";
import Link from "next/link";
import { ListTodo } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { toParisDay } from "@/lib/dates";
import { isoDay } from "@/lib/todos";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { listMyProjects, listMyTodos, listRestorableTodos } from "@/server/services/todos";
import { RestoreList } from "./RestoreList";
import { TodoList } from "./TodoList";

export const metadata: Metadata = { title: "À faire" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * « Ma liste »: everything assigned to me, projects included, grouped by due
 * day (En retard, Aujourd'hui, Cette semaine, Plus tard, Sans date), then the
 * tasks done in the last 30 days, folded. Filter by project.
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageAccess("todo.read");
  const raw = (await searchParams).projet;
  const projectId = typeof raw === "string" ? raw : null;
  const db = getDb();
  const [projects, list, restorable] = await Promise.all([
    listMyProjects(db, actor),
    listMyTodos(db, actor, { projectId }),
    listRestorableTodos(db, actor),
  ]);
  const today = isoDay(toParisDay());
  const filters = [{ id: null, name: "Tout" }, ...projects.active];
  return (
    <div className="flex flex-col gap-6">
      {projects.active.length > 0 && (
        <nav aria-label="Filtrer par projet" className="flex flex-wrap gap-2">
          {filters.map((p) => {
            const active = p.id === projectId;
            return (
              <Link
                key={p.id ?? "all"}
                href={p.id ? `/a-faire?projet=${p.id}` : "/a-faire"}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-mark px-4 text-small font-medium focus-ring",
                  active ? "bg-ink text-white" : "bg-surface text-ink hover:bg-veil",
                )}
              >
                {p.name}
              </Link>
            );
          })}
        </nav>
      )}
      {list.open.length === 0 && list.done.length === 0 ? (
        <EmptyState
          icon={<ListTodo />}
          title={projectId ? "Rien à faire dans ce projet" : "Votre liste est vide"}
          description="Tapez une tâche dans le champ ci-dessus, puis Entrée. « demain », « lundi » ou « 12/11 » posent une échéance, « @Prénom » la confie, « #projet » la range."
        />
      ) : (
        <div className="rounded-card bg-surface p-4 sm:p-6">
          <TodoList open={list.open} done={list.done} today={today} actorId={actor.userId} />
        </div>
      )}
      {restorable.length > 0 && <RestoreList todos={restorable} />}
    </div>
  );
}
