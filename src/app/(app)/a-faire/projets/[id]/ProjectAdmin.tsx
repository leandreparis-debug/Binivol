"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { TODO_PROJECT_ROLE_LABELS } from "@/lib/labels";
import { PROJECT_NAME_MAX } from "@/lib/todos";
import type { ProjectView } from "@/server/services/todos";
import {
  addProjectMemberAction,
  archiveProjectAction,
  removeProjectMemberAction,
  setProjectMemberRoleAction,
  updateProjectAction,
} from "../../actions";
import type { TodoOption } from "../../types";

/**
 * Members of a project. Everyone sees them; OWNERs add, remove, change a
 * role (at least one OWNER stays), rename and archive.
 */
export function ProjectAdmin({
  project,
  actorId,
  responsibles,
}: {
  project: ProjectView;
  actorId: string;
  responsibles: TodoOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(project.name);
  const [newMember, setNewMember] = useState("");
  const candidates = responsibles.filter((r) => !project.members.some((m) => m.userId === r.id));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Action impossible.");
        return;
      }
      setError(null);
      after?.();
      router.refresh();
    });
  };

  return (
    <aside
      aria-labelledby="project-members"
      className="flex flex-col gap-4 self-start rounded-card bg-surface p-4 sm:p-6"
    >
      <h3 id="project-members" className="text-section text-ink">
        Membres
      </h3>
      <ul className="flex flex-col divide-y divide-line">
        {project.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex flex-col">
              <span className="text-body text-ink">
                {m.name}
                {m.userId === actorId ? " (vous)" : ""}
              </span>
              {!project.isOwner && (
                <span className="text-small text-muted">{TODO_PROJECT_ROLE_LABELS[m.role]}</span>
              )}
            </span>
            {project.isOwner && (
              <span className="flex items-center gap-1">
                <label className="sr-only" htmlFor={`role-${m.id}`}>
                  Rôle de {m.name}
                </label>
                <Select
                  id={`role-${m.id}`}
                  value={m.role}
                  disabled={pending}
                  className="w-auto"
                  onChange={(event) => {
                    run(() =>
                      setProjectMemberRoleAction({
                        projectId: project.id,
                        userId: m.userId,
                        role: event.target.value as "OWNER" | "MEMBER",
                      }),
                    );
                  }}
                >
                  <option value="OWNER">{TODO_PROJECT_ROLE_LABELS.OWNER}</option>
                  <option value="MEMBER">{TODO_PROJECT_ROLE_LABELS.MEMBER}</option>
                </Select>
                <IconButton
                  aria-label={`Retirer ${m.name} du projet`}
                  variant="surface"
                  disabled={pending}
                  onClick={() => {
                    run(() =>
                      removeProjectMemberAction({ projectId: project.id, userId: m.userId }),
                    );
                  }}
                >
                  <UserMinus className="size-5" />
                </IconButton>
              </span>
            )}
          </li>
        ))}
      </ul>

      {project.isOwner && (
        <>
          {candidates.length > 0 && (
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!newMember) return;
                run(
                  () => addProjectMemberAction({ projectId: project.id, userId: newMember }),
                  () => {
                    setNewMember("");
                  },
                );
              }}
            >
              <Field label="Ajouter un membre" className="flex-1">
                <Select
                  value={newMember}
                  onChange={(event) => {
                    setNewMember(event.target.value);
                  }}
                >
                  <option value="">Choisir un responsable</option>
                  {candidates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <IconButton
                type="submit"
                aria-label="Ajouter ce membre"
                variant="ink"
                disabled={pending || !newMember}
              >
                <UserPlus className="size-5" />
              </IconButton>
            </form>
          )}
          <form
            className="flex flex-col gap-2 border-t border-line pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => updateProjectAction({ projectId: project.id, name }));
            }}
          >
            <Field label="Nom du projet">
              <Input
                value={name}
                maxLength={PROJECT_NAME_MAX}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>
            <Button type="submit" variant="outline" disabled={pending} className="self-start">
              Renommer
            </Button>
          </form>
          {!project.archivedAt && (
            <Button
              variant="outline"
              leftIcon={<Archive />}
              disabled={pending}
              className="self-start"
              onClick={() => {
                run(
                  () => archiveProjectAction({ projectId: project.id }),
                  () => {
                    router.push("/a-faire/projets");
                  },
                );
              }}
            >
              Archiver le projet
            </Button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-small font-medium text-danger-ink">
          {error}
        </p>
      )}
    </aside>
  );
}
