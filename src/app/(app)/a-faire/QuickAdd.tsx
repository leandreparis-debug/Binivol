"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { CalendarDays, Plus, SlidersHorizontal, X } from "lucide-react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, Input, Select } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";
import {
  longDay,
  parseQuickAdd,
  resolveMentions,
  resolveProjectTag,
  TODO_TITLE_MAX,
} from "@/lib/todos";
import { createTodoAction, linkablePersonAction } from "./actions";
import type { TodoOption } from "./types";

export interface QuickAddProps {
  /** Today in Paris, `AAAA-MM-JJ`. */
  today: string;
  actorId: string;
  responsibles: TodoOption[];
  projects: TodoOption[];
  /** On a project page: the project is set and the people are its members. */
  fixedProject?: TodoOption;
}

const WEEKDAY = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });

/** « sam. 07/11/2026 ». */
function dueLabel(day: string): string {
  return `${WEEKDAY.format(new Date(`${day}T00:00:00Z`))} ${longDay(day)}`;
}

/**
 * The quick-add field, always at the top of « À faire »: type, Enter, it is
 * added. Shortcuts in the text (« demain », « lundi », « 12/11 », « @Prénom »,
 * « #projet ») are shown as removable chips before validation; the same
 * choices are offered by plain controls (« Options »), so nobody depends on
 * the syntax. `?personne=P-00012` (from a person page) links the task.
 */
export function QuickAdd({ today, actorId, responsibles, projects, fixedProject }: QuickAddProps) {
  const router = useRouter();
  const params = useSearchParams();
  const inputId = useId();
  const optionsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [ignoreDue, setIgnoreDue] = useState(false);
  const [manualDue, setManualDue] = useState("");
  const [manualAssignees, setManualAssignees] = useState<string[]>([]);
  const [manualProject, setManualProject] = useState("");
  const [person, setPerson] = useState<TodoOption | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [pending, startTransition] = useTransition();

  const personRef = params.get("personne");
  useEffect(() => {
    if (!personRef) return;
    void linkablePersonAction({ ref: personRef }).then((result) => {
      if (result.ok && result.data) {
        setPerson(result.data);
        inputRef.current?.focus();
      }
    });
  }, [personRef]);

  const parsed = useMemo(() => parseQuickAdd(text, today), [text, today]);
  const others = responsibles.filter((r) => r.id !== actorId);
  const mentions = resolveMentions(parsed.mentions, responsibles);
  const taggedProject = fixedProject ?? resolveProjectTag(parsed.projectTag, projects);
  const project =
    fixedProject ?? (manualProject ? projects.find((p) => p.id === manualProject) : taggedProject);
  const dueDate = manualDue || (ignoreDue ? null : parsed.dueDate);
  const assigneeIds = [...new Set([...mentions.ids, ...manualAssignees])];
  const nameOf = (id: string) => responsibles.find((r) => r.id === id)?.name ?? "";

  const reset = () => {
    setText("");
    setIgnoreDue(false);
    setManualDue("");
    setManualAssignees([]);
    setManualProject("");
    setPerson(null);
    setError(null);
  };

  const submit = () => {
    const title = parsed.title.slice(0, TODO_TITLE_MAX);
    if (!title) {
      setError("Écrivez d'abord ce qu'il y a à faire.");
      return;
    }
    if (parsed.projectTag && !taggedProject && !manualProject && !fixedProject) {
      setError(`Projet « #${parsed.projectTag} » introuvable parmi vos projets.`);
      return;
    }
    startTransition(async () => {
      const result = await createTodoAction({
        title,
        dueDate: dueDate ?? null,
        projectId: project?.id ?? null,
        personId: person?.id ?? null,
        assigneeIds,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAnnounce(`Tâche ajoutée : ${title}.`);
      reset();
      if (personRef) router.replace(window.location.pathname, { scroll: false });
      router.refresh();
      inputRef.current?.focus();
    });
  };

  const chips: { key: string; label: string; onRemove?: () => void }[] = [];
  if (dueDate) {
    chips.push({
      key: "due",
      label: `Échéance : ${dueLabel(dueDate)}`,
      onRemove: () => {
        setManualDue("");
        setIgnoreDue(true);
      },
    });
  }
  for (const id of assigneeIds) {
    chips.push({
      key: `a-${id}`,
      label: `Pour : ${nameOf(id)}`,
      onRemove: () => {
        setManualAssignees((list) => list.filter((x) => x !== id));
        if (mentions.ids.includes(id)) {
          setText((t) =>
            t
              .split(/\s+/)
              .filter((w) => {
                if (!w.startsWith("@")) return true;
                return !resolveMentions([w.slice(1)], responsibles).ids.includes(id);
              })
              .join(" "),
          );
        }
      },
    });
  }
  if (project && !fixedProject) {
    chips.push({
      key: "project",
      label: `Projet : ${project.name}`,
      onRemove: () => {
        setManualProject("");
        setText((t) =>
          t
            .split(/\s+/)
            .filter((w) => !w.startsWith("#"))
            .join(" "),
        );
      },
    });
  }
  if (person) {
    chips.push({
      key: "person",
      label: `Lié à : ${person.name}`,
      onRemove: () => {
        setPerson(null);
      },
    });
  }
  const peopleChoices = fixedProject
    ? others.filter((r) => fixedProject.memberIds?.includes(r.id))
    : project
      ? others.filter((r) => project.memberIds?.includes(r.id))
      : others;

  return (
    <section
      aria-label="Ajouter une tâche"
      className="flex flex-col gap-3 rounded-card bg-surface p-4 sm:p-5"
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Nouvelle tâche
        </label>
        <Input
          ref={inputRef}
          id={inputId}
          value={text}
          maxLength={TODO_TITLE_MAX + 120}
          autoComplete="off"
          enterKeyHint="done"
          placeholder={
            fixedProject
              ? `Ajouter à ${fixedProject.name}… (demain, @Prénom)`
              : "Ajouter une tâche… (demain, @Prénom, #projet)"
          }
          aria-describedby={error ? `${inputId}-error` : undefined}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setIgnoreDue(false);
            setError(null);
          }}
          className="h-12 flex-1"
        />
        <IconButton
          aria-label="Options : échéance, responsables, projet"
          aria-expanded={optionsOpen}
          aria-controls={optionsId}
          variant="outline"
          className="size-12"
          onClick={() => {
            setOptionsOpen((o) => !o);
          }}
        >
          <SlidersHorizontal className="size-5" />
        </IconButton>
        <IconButton
          type="submit"
          aria-label="Ajouter la tâche"
          variant="ink"
          className="size-12"
          aria-busy={pending || undefined}
        >
          <Plus className="size-5" />
        </IconButton>
      </form>

      {(chips.length > 0 || mentions.unknown.length > 0) && (
        <ul className="flex flex-wrap gap-2" aria-label="Ce qui sera enregistré">
          {chips.map((chip) => (
            <li key={chip.key}>
              <span className="inline-flex h-9 items-center gap-1 rounded-mark bg-veil pr-1 pl-3 text-small font-medium text-ink">
                {chip.key === "due" && <CalendarDays aria-hidden="true" className="size-4" />}
                {chip.label}
                {chip.onRemove && (
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-pill text-muted focus-ring hover:bg-line hover:text-ink"
                    aria-label={`Retirer « ${chip.label} »`}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                )}
              </span>
            </li>
          ))}
          {mentions.unknown.map((m) => (
            <li key={`u-${m}`}>
              <span className="inline-flex h-9 items-center rounded-mark bg-warn-soft px-3 text-small font-medium text-warn-ink">
                @{m} : responsable inconnu ou ambigu
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-small font-medium text-danger-ink">
          {error}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div
        id={optionsId}
        hidden={!optionsOpen}
        className={cn("grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3")}
      >
        <Field label="Échéance">
          <Input
            type="date"
            value={dueDate ?? ""}
            onChange={(event) => {
              setManualDue(event.target.value);
              if (!event.target.value) setIgnoreDue(true);
            }}
          />
        </Field>
        {!fixedProject && (
          <Field label="Projet">
            <Select
              value={project?.id ?? ""}
              onChange={(event) => {
                setManualProject(event.target.value);
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
        )}
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-small font-medium text-ink">
            Mettre dans la liste de… (plusieurs : tâche partagée)
          </legend>
          {peopleChoices.length === 0 && (
            <p className="text-small text-muted">Personne d&apos;autre à qui la confier ici.</p>
          )}
          <div className="flex max-h-56 flex-col overflow-y-auto">
            {peopleChoices.map((r) => (
              <Checkbox
                key={r.id}
                label={r.name}
                checked={assigneeIds.includes(r.id)}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setManualAssignees((list) =>
                    checked ? [...list, r.id] : list.filter((x) => x !== r.id),
                  );
                  if (!checked && mentions.ids.includes(r.id)) {
                    setText((t) =>
                      t
                        .split(/\s+/)
                        .filter(
                          (w) =>
                            !w.startsWith("@") ||
                            !resolveMentions([w.slice(1)], responsibles).ids.includes(r.id),
                        )
                        .join(" "),
                    );
                  }
                }}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}
