"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/dates";
import type { TodoView } from "@/server/services/todos";
import { restoreTodoAction } from "./actions";

/** « Supprimées récemment »: archived tasks of mine, restorable for 30 days. */
export function RestoreList({ todos }: { todos: TodoView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="rounded-card bg-surface p-4 sm:p-6">
      <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control text-section text-ink focus-ring">
        Supprimées récemment
        <span className="text-body font-normal text-muted tabular-nums">{todos.length}</span>
      </summary>
      <p className="mt-1 text-small text-muted">
        Une tâche supprimée se restaure pendant 30 jours.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-small text-danger-ink">
          {error}
        </p>
      )}
      <ul className="mt-3 flex flex-col divide-y divide-line">
        {todos.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <span className="flex flex-col">
              <span className="text-body text-ink">{t.title}</span>
              <span className="text-small text-muted">Supprimée le {formatDate(t.archivedAt)}</span>
            </span>
            <Button
              variant="outline"
              leftIcon={<RotateCcw />}
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await restoreTodoAction({ todoId: t.id });
                  if (!result.ok) setError(result.error);
                  router.refresh();
                });
              }}
            >
              Restaurer
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
