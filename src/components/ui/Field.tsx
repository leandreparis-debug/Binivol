"use client";

import { createContext, forwardRef, useContext, useId } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";

interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Returns the ids and state the enclosing `Field` wants its control to carry. */
export function useFieldControl(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  required?: boolean;
}) {
  const field = useContext(FieldContext);
  const describedBy =
    [field?.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  return {
    id: props.id ?? field?.id,
    "aria-describedby": describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field?.invalid ? true : undefined),
    required: props.required ?? field?.required,
  };
}

export interface FieldProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Visible label (mandatory). */
  label: string;
  /** Help text under the control. */
  hint?: string;
  /** Error message; when set the control gets `aria-invalid` and is described by it. */
  error?: string;
  required?: boolean;
  /** Id of the control; generated when omitted. */
  htmlFor?: string;
  children: React.ReactNode;
}

/**
 * Wraps one form control with its label, hint and error, wired through
 * `aria-describedby` and `aria-invalid`. Controls read the wiring via context.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  className,
  children,
  ...rest
}: FieldProps) {
  const generated = useId();
  const id = htmlFor ?? `field-${generated}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error), required }}>
      <div className={cn("flex flex-col gap-1.5", className)} {...rest}>
        <label htmlFor={id} className="text-small font-medium text-ink">
          {label}
          {required && (
            <span className="text-danger" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </label>
        {children}
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
      </div>
    </FieldContext.Provider>
  );
}

export const controlClasses =
  "focus-ring w-full rounded-field border border-line bg-surface px-4 text-[16px] leading-6 text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:bg-veil disabled:opacity-60 aria-invalid:border-danger sm:text-body";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/** Text input, 16 px radius, 44 px tall. 16 px font on mobile prevents iOS zoom. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  const wiring = useFieldControl(props);
  return (
    <input ref={ref} {...props} {...wiring} className={cn(controlClasses, "h-11", className)} />
  );
});

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Multi-line input. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  const wiring = useFieldControl(props);
  return (
    <textarea
      ref={ref}
      rows={rows}
      {...props}
      {...wiring}
      className={cn(controlClasses, "min-h-11 resize-y py-2.5", className)}
    />
  );
});

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/** Native select with a chevron. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref,
) {
  const wiring = useFieldControl(props);
  return (
    <span className="relative block">
      <select
        ref={ref}
        {...props}
        {...wiring}
        className={cn(controlClasses, "h-11 appearance-none pr-10", className)}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted"
      />
    </span>
  );
});

export interface SearchInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  /** Accessible name; the field has no visible label. */
  "aria-label": string;
}

/** Pill-shaped search field with a magnifier icon. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className, ...props },
  ref,
) {
  return (
    <span className={cn("relative block", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted"
      />
      <input
        ref={ref}
        type="search"
        {...props}
        className={cn(controlClasses, "h-11 rounded-field pl-11")}
      />
    </span>
  );
});
