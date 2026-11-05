"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/server/actions/defineAction";

export interface FormFeedback {
  tone: "ok" | "danger";
  text: string;
}

/**
 * Runs a Server Action from a form: pending state, field-by-field errors
 * (from the Zod schema, keyed by field name), a global message, and a
 * refresh of the page on success.
 */
export function useFormAction<T>() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const run = (
    call: () => Promise<ActionResult<T>>,
    options: { success?: string; onSuccess?: (data: T) => void } = {},
  ) => {
    startTransition(async () => {
      const result = await call();
      if (result.ok) {
        setFieldErrors({});
        setFeedback(options.success ? { tone: "ok", text: options.success } : null);
        options.onSuccess?.(result.data);
        router.refresh();
        return;
      }
      setFieldErrors(result.fieldErrors ?? {});
      setFeedback({ tone: "danger", text: result.error });
    });
  };

  const errorOf = (field: string) => fieldErrors[field]?.[0];
  const reset = () => {
    setFeedback(null);
    setFieldErrors({});
  };
  return { pending, feedback, errorOf, run, reset };
}

/** Global message of a form (role alert for errors, status for success). */
export function FormMessage({ feedback }: { feedback: FormFeedback | null }) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.tone === "danger" ? "alert" : "status"}
      className={
        feedback.tone === "danger"
          ? "text-small font-medium text-danger-ink"
          : "text-small font-medium text-ok-ink"
      }
    >
      {feedback.text}
    </p>
  );
}
