import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { PROJECT_COLOR_DOT } from "@/lib/todos";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { listMyProjects, listResponsibles } from "@/server/services/todos";
import { NewProjectDialog } from "./NewProjectDialog";
import { RestoreProjectButton } from "./RestoreProjectButton";

export const metadata: Metadata = { title: "Projets" };
export const dynamic = "force-dynamic";

function split(name: string): [string, string] {
  const [first = "", ...rest] = name.split(/\s+/);
  return [first, rest.join(" ")];
}

/** « Projets »: my projects, their members and progress « 7 / 12 ». */
export default async function Page() {
  const actor = await requirePageAccess("todo.read");
  const db = getDb();
  const [projects, responsibles] = await Promise.all([
    listMyProjects(db, actor),
    listResponsibles(db, actor),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <NewProjectDialog responsibles={responsibles.filter((r) => r.id !== actor.userId)} />
      </div>
      {projects.active.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="Aucun projet"
          description="Un projet est une liste partagée par plusieurs responsables (« Forum des associations », « Recrutement printemps »)."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.active.map((p) => (
            <li key={p.id}>
              <Link
                href={`/a-faire/projets/${p.id}`}
                className="flex h-full hover-lift flex-col gap-4 rounded-card bg-surface p-5 focus-ring sm:p-6"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn("size-3 shrink-0 rounded-pill", PROJECT_COLOR_DOT[p.color])}
                  />
                  <span className="text-section text-ink">{p.name}</span>
                </span>
                {p.description && (
                  <span className="line-clamp-2 text-small text-ink-2">{p.description}</span>
                )}
                <span className="mt-auto flex items-center justify-between gap-3">
                  <span
                    className="flex -space-x-2"
                    aria-label={`${String(p.members.length)} membres`}
                  >
                    {p.members.slice(0, 5).map((m) => {
                      const [first, last] = split(m.name);
                      return (
                        <Avatar
                          key={m.id}
                          firstName={first}
                          lastName={last}
                          size="sm"
                          className="ring-2 ring-surface"
                        />
                      );
                    })}
                  </span>
                </span>
                <ProgressBar
                  value={p.done}
                  max={Math.max(p.total, 1)}
                  label={`Avancement de ${p.name}`}
                  valueText={`${String(p.done)} / ${String(p.total)}`}
                  showValue
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {projects.archived.length > 0 && (
        <details className="rounded-card bg-surface p-4 sm:p-6">
          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-control text-section text-ink focus-ring">
            Projets archivés
          </summary>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {projects.archived.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="flex flex-col">
                  <span className="text-body text-ink">{p.name}</span>
                  <span className="text-small text-muted">
                    Archivé le {formatDate(p.archivedAt)}
                  </span>
                </span>
                {p.isOwner && <RestoreProjectButton projectId={p.id} />}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
