"use client";

import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { ParameterDef } from "@/server/parameters";
import { useRef, useState, useTransition } from "react";
import { previewIndicatorsAction, saveParameterAction } from "./actions";

/** One parameter: its field, its help and default, « Enregistrer ». */
export function ParameterForm({ def, value }: { def: ParameterDef; value: string }) {
  const { pending, feedback, run } = useFormAction<null>();
  const id = `param-${def.key}`;
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState<{ label: string; value: number }[] | string | null>(null);
  const [previewing, startPreview] = useTransition();
  return (
    <form
      noValidate
      aria-label={def.label}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const raw = new FormData(event.currentTarget).get("value");
        run(
          () => saveParameterAction({ key: def.key, value: typeof raw === "string" ? raw : "" }),
          {
            success: "Enregistré.",
          },
        );
      }}
    >
      <Field label={def.label} htmlFor={id} hint={`${def.help} Par défaut : ${def.defaultLabel}.`}>
        {def.kind === "longtext" ||
        def.kind === "gaia" ||
        def.kind === "diplomas" ||
        def.kind === "indicators" ? (
          <Textarea
            ref={textRef}
            id={id}
            name="value"
            rows={def.kind === "longtext" ? 8 : def.kind === "gaia" ? 5 : 10}
            defaultValue={value}
          />
        ) : def.kind === "enum" ? (
          <Select id={id} name="value" defaultValue={value}>
            {def.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            id={id}
            name="value"
            type={def.kind === "int" ? "number" : "text"}
            min={def.min}
            max={def.max}
            defaultValue={value}
          />
        )}
      </Field>
      <FormMessage feedback={feedback} />
      {def.kind === "indicators" && preview !== null && (
        <div role="status" className="rounded-inner bg-veil/60 p-3 text-small text-ink">
          {typeof preview === "string" ? (
            <span className="text-danger-ink">{preview}</span>
          ) : (
            <ul className="flex flex-col gap-1" aria-label="Aperçu des indicateurs">
              {preview.map((p) => (
                <li key={p.label} className="flex justify-between gap-3">
                  <span>{p.label}</span>
                  <span className="font-semibold tabular-nums">{p.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        {def.kind === "indicators" && (
          <Button
            type="button"
            variant="ghost"
            loading={previewing}
            onClick={() => {
              startPreview(async () => {
                const result = await previewIndicatorsAction({
                  value: textRef.current?.value ?? "",
                });
                setPreview(result.ok ? result.data : result.error);
              });
            }}
          >
            Aperçu
          </Button>
        )}
        <Button type="submit" variant="outline" loading={pending}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
