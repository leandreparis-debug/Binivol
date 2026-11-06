"use client";

import { useState } from "react";
import { ClipboardCopy, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

/** Writes to the clipboard; false when the browser refuses (the user selects by hand). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface CopyFieldProps {
  /** Name of the field, read out: « Copier <label> ». */
  label: string;
  /** Exactly what is copied (already formatted). */
  text: string;
  /** Called after each attempt (e.g. to announce in a shared live region). */
  onCopied?: (ok: boolean, label: string) => void;
  className?: string;
}

/**
 * « Copier » button of one value: icon and word, accessible name « Copier
 * <champ> », a discreet « Copié » confirmation (polite live region). Copying
 * loads nothing and writes nothing in the database.
 */
export function CopyField({ label, text, onCopied, className }: CopyFieldProps) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Button
        variant="ghost"
        aria-label={`Copier ${label}`}
        leftIcon={<Copy aria-hidden="true" />}
        onClick={() => {
          void copyToClipboard(text).then((ok) => {
            setState(ok ? "done" : "failed");
            onCopied?.(ok, label);
          });
        }}
      >
        {state === "done" ? "Copié" : "Copier"}
      </Button>
      <span className="sr-only" aria-live="polite">
        {state === "done" ? `${label} copié.` : state === "failed" ? "Copie impossible." : ""}
      </span>
    </span>
  );
}

export interface CopyAllButtonProps {
  /** Visible text: « Tout copier », « Copier la section ». */
  children: string;
  /** Accessible name when the text alone is ambiguous (« Copier la section Profil »). */
  ariaLabel?: string;
  /** Computed on click: only what is shown on the screen. */
  getText: () => string;
  variant?: "primary" | "outline" | "ghost";
  /** Confirmation shown after copying. Default « Copié ». */
  doneMessage?: string;
  className?: string;
}

/** Copies several values at once (tabulated text), with the same discreet confirmation. */
export function CopyAllButton({
  children,
  ariaLabel,
  getText,
  variant = "outline",
  doneMessage = "Copié",
  className,
}: CopyAllButtonProps) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <Button
        variant={variant}
        aria-label={ariaLabel}
        leftIcon={<ClipboardCopy aria-hidden="true" />}
        onClick={() => {
          void copyToClipboard(getText()).then((ok) => {
            setState(ok ? "done" : "failed");
          });
        }}
      >
        {children}
      </Button>
      <span className="text-small text-ink-2" aria-live="polite">
        {state === "done"
          ? doneMessage
          : state === "failed"
            ? "Copie impossible : sélectionnez le texte."
            : ""}
      </span>
    </span>
  );
}
