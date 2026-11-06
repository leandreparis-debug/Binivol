import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { getEnv } from "@/lib/env";
import { toParisDay } from "@/lib/dates";
import { isoDay } from "@/lib/todos";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { listMyProjects, listResponsibles } from "@/server/services/todos";
import { QuickAdd } from "./QuickAdd";
import { TodoPanel } from "./TodoPanel";
import { TodoTabs } from "./TodoTabs";

/**
 * « À faire » (step 16): the quick-add field always at the top, the three
 * tabs (Ma liste, Confiées, Projets) and the task panel (`?tache=`), shared
 * by every page of the section.
 */
export default async function TodoLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageAccess("todo.read");
  const db = getDb();
  const [responsibles, projects] = await Promise.all([
    listResponsibles(db, actor),
    listMyProjects(db, actor),
  ]);
  const projectOptions = projects.active.map((p) => ({
    id: p.id,
    name: p.name,
    memberIds: p.members.map((m) => m.userId),
  }));
  return (
    <>
      <PageHeader
        title="À faire"
        subtitle="Votre liste, ce que vous avez confié, et les projets de l'équipe."
        actions={getEnv().AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      <div className="flex flex-col gap-6">
        <QuickAdd
          today={isoDay(toParisDay())}
          actorId={actor.userId}
          responsibles={responsibles}
          projects={projectOptions}
        />
        <TodoTabs />
        {children}
      </div>
      <TodoPanel actorId={actor.userId} responsibles={responsibles} projects={projectOptions} />
    </>
  );
}
