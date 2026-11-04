"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Modal dialog (Radix): focus trapped, Escape closes, title and description wired for screen readers. */
export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps extends React.ComponentPropsWithoutRef<
  typeof RadixDialog.Content
> {
  title: string;
  description?: React.ReactNode;
}

export function DialogContent({
  title,
  description,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
      <RadixDialog.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card bg-surface p-6 text-ink shadow-pop focus-ring",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <RadixDialog.Title className="text-section text-ink">{title}</RadixDialog.Title>
          <RadixDialog.Close
            className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-muted focus-ring hover:bg-veil"
            aria-label="Fermer"
          >
            <X className="size-5" aria-hidden="true" />
          </RadixDialog.Close>
        </div>
        {description && (
          <RadixDialog.Description className="mt-2 text-body text-ink-2">
            {description}
          </RadixDialog.Description>
        )}
        <div className="mt-6">{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
