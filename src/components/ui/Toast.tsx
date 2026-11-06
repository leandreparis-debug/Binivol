"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

export interface ToastProps {
  /** What just happened (« Tâche terminée »). Read out politely by screen readers. */
  message: string;
  /** Optional undo button (« Annuler »). */
  actionLabel?: string;
  onAction?: () => void;
  /** Called when the toast goes away (after `duration`, or after the action). */
  onClose: () => void;
  /** Milliseconds before it closes on its own. Default 5 000. */
  duration?: number;
  className?: string;
}

/**
 * A short confirmation at the bottom of the screen, above the phone's bottom
 * navigation, with an optional action (« Annuler », 5 s). Ink pill, white
 * text; `role="status"` so it is announced without moving the focus.
 */
export function Toast({
  message,
  actionLabel,
  onAction,
  onClose,
  duration = 5000,
  className,
}: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onClose, duration]);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-4 bottom-20 z-50 mx-auto flex min-h-12 max-w-md items-center justify-between gap-3 rounded-control bg-ink py-1 pr-1 pl-5 text-body text-white shadow-pop sm:bottom-6",
        className,
      )}
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={() => {
            onAction();
            onClose();
          }}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-control px-4 font-semibold text-white underline underline-offset-4 focus-ring hover:bg-white/10"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
