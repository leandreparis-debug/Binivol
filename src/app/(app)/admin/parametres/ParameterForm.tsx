"use client";

import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { ParameterDef } from "@/server/parameters";
import { saveParameterAction } from "./actions";

/** One parameter: its field, its help and default, « Enregistrer ». */
export function ParameterForm({ def, value }: { def: ParameterDef; value: string }) {
  const { pending, feedback, run } = useFormAction<null>();
  const id = `param-${def.key}`;
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
        {def.kind === "longtext" || def.kind === "gaia" || def.kind === "diplomas" ? (
          <Textarea
            id={id}
            name="value"
            rows={def.kind === "longtext" ? 8 : def.kind === "diplomas" ? 12 : 5}
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
      <div className="flex justify-end">
        <Button type="submit" variant="outline" loading={pending}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
