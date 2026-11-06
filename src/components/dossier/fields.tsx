"use client";

import { useId } from "react";
import { Field, Input, Select } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import type { DossierDraft } from "@/lib/dossierSchema";
import { fieldId, fieldValue, isRequired, type FieldDef } from "./config";

export interface ChoiceGroupProps {
  /** Visible question (the legend of the group). */
  legend: string;
  name: string;
  value: string | undefined;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  hint?: string;
  /** Id of the first radio (for « go to the field » links). */
  id?: string;
}

/**
 * A short single choice (civility, yes / no) as pill radios, 44 px high.
 * Real radio inputs, grouped by a `fieldset` and its `legend`.
 */
export function ChoiceGroup({
  legend,
  name,
  value,
  options,
  onChange,
  required = false,
  error,
  hint,
  id,
}: ChoiceGroupProps) {
  const generated = useId();
  const base = id ?? `choice-${generated}`;
  const errorId = error ? `${base}-error` : undefined;
  const hintId = hint ? `${base}-hint` : undefined;
  return (
    <fieldset
      className="flex flex-col gap-1.5"
      aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="mb-1.5 text-small font-medium text-ink">
        {legend}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => (
          <label
            key={option.value}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-control border px-4 text-body",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2",
              value === option.value
                ? "border-ink bg-ink text-white"
                : "border-line bg-surface text-ink hover:bg-veil",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              id={index === 0 ? base : `${base}-${String(index)}`}
              value={option.value}
              checked={value === option.value}
              onChange={() => {
                onChange(option.value);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint && (
        <p id={hintId} className="text-small text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-small font-medium text-danger-ink" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

const yesNo = [
  { value: "yes", label: "Oui" },
  { value: "no", label: "Non" },
] as const;

/** A yes / no question bound to an optional boolean. */
export function YesNo(props: {
  legend: string;
  name: string;
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  error?: string;
  hint?: string;
  id?: string;
}) {
  return (
    <ChoiceGroup
      legend={props.legend}
      name={props.name}
      id={props.id}
      value={props.value === undefined ? undefined : props.value ? "yes" : "no"}
      options={yesNo}
      onChange={(v) => {
        props.onChange(v === "yes");
      }}
      error={props.error}
      hint={props.hint}
      required
    />
  );
}

const INPUT_TYPE = { text: "text", email: "email", tel: "tel", date: "date", postal: "text" };

/** Renders one declared field of a simple step. */
export function DeclaredField({
  def,
  draft,
  error,
  onChange,
  today,
}: {
  def: FieldDef;
  draft: DossierDraft;
  error?: string;
  onChange: (value: string) => void;
  today: string;
}) {
  const id = fieldId(def.section, def.name);
  const value = fieldValue(draft, def);
  const required = isRequired(def, draft);
  if (def.kind === "choice") {
    return (
      <ChoiceGroup
        legend={def.label}
        name={id}
        id={id}
        value={value || undefined}
        options={def.options}
        onChange={onChange}
        required={required}
        error={error}
        hint={def.hint}
      />
    );
  }
  if (def.kind === "select") {
    return (
      <Field label={def.label} htmlFor={id} required={required} error={error} hint={def.hint}>
        <Select
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        >
          <option value="">Choisir…</option>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  return (
    <Field label={def.label} htmlFor={id} required={required} error={error} hint={def.hint}>
      <Input
        type={INPUT_TYPE[def.kind]}
        value={value}
        maxLength={def.maxLength}
        autoComplete={def.autoComplete ?? "off"}
        placeholder={def.placeholder}
        inputMode={def.kind === "postal" ? "numeric" : undefined}
        min={def.kind === "date" ? `${String(Number(today.slice(0, 4)) - 100)}-01-01` : undefined}
        max={def.kind === "date" ? today : undefined}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </Field>
  );
}
