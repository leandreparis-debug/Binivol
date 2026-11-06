import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { toParisDay } from "@/lib/dates";
import { isoDay, PROJECT_COLOR_DOT } from "@/lib/todos";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { getProject, listResponsibles } from "@/server/services/todos";
import { TodoList } from "../../TodoList";
import { ProjectAdmin } from "./ProjectAdmin";

export const metadata: Metadata = { title: "Projet" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * A project: its tasks « À faire » and « Fait », a filter by member, and for
 * its OWNERs the members (add, remove, role) and the archiving. Not a member:
 * not found.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const actor = await requirePageAccess("todo.read");
  const { id } = await params;
  const rawMember = (await searchParams).membre;
  const member = typeof rawMember === "string" ? rawMember : null;
  const db = getDb();
  let data: Awaited<ReturnType<typeof getProject>>;
  try {
    data = await getProject(db, actor, id);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
  const { project, todos } = data;
  const responsibles = project.isOwner ? await listResponsibles(db, actor) : [];
  const shown = member ? todos.filter((t) => t.assignees.some((a) => a.id === member)) : todos;
  const today = isoDay(toParisDay());
  const filters = [{ userId: null, name: "Tout le monde" }, ...project.members];
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/a-faire/projets"
        className="inline-flex min-h-11 w-max items-center gap-2 rounded-control text-small text-ink-2 focus-ring hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Projets
      </Link>
      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-3 text-title text-ink">
          <span
            aria-hidden="true"
            className={cn("size-3.5 shrink-0 rounded-pill", PROJECT_COLOR_DOT[project.color])}
          />
          {project.name}
          {project.archivedAt && (
            <span className="text-body font-normal text-muted">(archivé)</span>
          )}
        </h2>
        {project.description && <p className="text-body text-ink-2">{project.description}</p>}
        <p className="text-small text-muted tabular-nums">
          {project.done} / {project.total} tâches faites
        </p>
      </div>

      <nav aria-label="Filtrer par membre" className="flex flex-wrap gap-2">
        {filters.map((m) => {
          const active = m.userId === member;
          return (
            <Link
              key={m.userId ?? "all"}
              href={
                m.userId
                  ? `/a-faire/projets/${project.id}?membre=${m.userId}`
                  : `/a-faire/projets/${project.id}`
              }
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-mark px-4 text-small font-medium focus-ring",
                active ? "bg-ink text-white" : "bg-surface text-ink hover:bg-veil",
              )}
            >
              {m.userId === actor.userId ? "Moi" : m.name}
            </Link>
          );
        })}
      </nav>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <section aria-labelledby="project-todo" className="rounded-card bg-surface p-4 sm:p-6">
            <h3 id="project-todo" className="mb-3 text-section text-ink">
              À faire
            </h3>
            <TodoList
              open={shown.filter((t) => t.completedAt === null)}
              today={today}
              actorId={actor.userId}
              layout="flat"
              headingLevel={3}
              emptyLabel="Rien à faire pour l'instant."
            />
          </section>
          <section aria-labelledby="project-done" className="rounded-card bg-surface p-4 sm:p-6">
            <h3 id="project-done" className="mb-3 text-section text-ink">
              Fait
            </h3>
            <TodoList
              open={shown.filter((t) => t.completedAt !== null)}
              today={today}
              actorId={actor.userId}
              layout="flat"
              headingLevel={3}
              emptyLabel="Aucune tâche terminée."
            />
          </section>
        </div>
        <ProjectAdmin project={project} actorId={actor.userId} responsibles={responsibles} />
      </div>
    </div>
  );
}
