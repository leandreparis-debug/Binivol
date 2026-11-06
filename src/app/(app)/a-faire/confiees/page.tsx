import type { Metadata } from "next";
import { Send } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { toParisDay } from "@/lib/dates";
import { isoDay } from "@/lib/todos";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { listConfidedTodos } from "@/server/services/todos";
import { TodoList } from "../TodoList";

export const metadata: Metadata = { title: "Tâches confiées" };
export const dynamic = "force-dynamic";

/** « Confiées »: what I put in someone else's list, with who has it and its state. */
export default async function Page() {
  const actor = await requirePageAccess("todo.read");
  const todos = await listConfidedTodos(getDb(), actor);
  const open = todos.filter((t) => t.completedAt === null);
  const done = todos.filter((t) => t.completedAt !== null);
  if (todos.length === 0) {
    return (
      <EmptyState
        icon={<Send />}
        title="Vous n'avez rien confié"
        description="Ajoutez « @Prénom » à une tâche, ou choisissez un responsable dans les options : elle arrive dans sa liste, et vous la suivez ici."
      />
    );
  }
  return (
    <div className="rounded-card bg-surface p-4 sm:p-6">
      <TodoList
        open={open}
        done={done}
        today={isoDay(toParisDay())}
        actorId={actor.userId}
        layout="flat"
        confidedView
      />
    </div>
  );
}
