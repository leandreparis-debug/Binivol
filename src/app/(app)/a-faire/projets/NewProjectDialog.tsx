"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import {
  PROJECT_COLOR_LABELS,
  PROJECT_COLORS,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  type ProjectColor,
} from "@/lib/todos";
import { createProjectAction } from "../actions";
import type { TodoOption } from "../types";

/** « Nouveau projet »: name, description, colour (a design token), members. */
export function NewProjectDialog({ responsibles }: { responsibles: TodoOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<ProjectColor>("INK");
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button leftIcon={<Plus />}>Nouveau projet</Button>
      </DialogTrigger>
      <DialogContent
        title="Nouveau projet"
        description="Vous en serez responsable (OWNER) ; les membres voient et ajoutent ses tâches."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await createProjectAction({
                name,
                description: description.trim() ? description : null,
                color,
                memberIds: members,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setOpen(false);
              router.push(`/a-faire/projets/${result.data.id}`);
            });
          }}
        >
          <Field label="Nom" required>
            <Input
              value={name}
              maxLength={PROJECT_NAME_MAX}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>
          <Field
            label="Description"
            hint="N'écrivez pas de donnée de santé ni d'information sensible ici."
          >
            <Textarea
              value={description}
              rows={3}
              maxLength={PROJECT_DESCRIPTION_MAX}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
            />
          </Field>
          <Field label="Couleur">
            <Select
              value={color}
              onChange={(event) => {
                setColor(event.target.value as ProjectColor);
              }}
            >
              {PROJECT_COLORS.map((c) => (
                <option key={c} value={c}>
                  {PROJECT_COLOR_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-small font-medium text-ink">Membres</legend>
            <div className="flex max-h-56 flex-col overflow-y-auto">
              {responsibles.map((r) => (
                <Checkbox
                  key={r.id}
                  label={r.name}
                  checked={members.includes(r.id)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setMembers((list) =>
                      checked ? [...list, r.id] : list.filter((x) => x !== r.id),
                    );
                  }}
                />
              ))}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-small font-medium text-danger-ink">
              {error}
            </p>
          )}
          <Button type="submit" loading={pending} className="self-start">
            Créer le projet
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
