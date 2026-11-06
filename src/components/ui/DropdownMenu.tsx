"use client";

import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

/** Thin wrappers over Radix Dropdown Menu, styled with Binivol tokens. */
export const DropdownMenu = RadixDropdown.Root;
export const DropdownMenuTrigger = RadixDropdown.Trigger;
export const DropdownMenuGroup = RadixDropdown.Group;

export const DropdownMenuContent = forwardRef<
  React.ComponentRef<typeof RadixDropdown.Content>,
  React.ComponentPropsWithoutRef<typeof RadixDropdown.Content>
>(function DropdownMenuContent({ className, sideOffset = 8, ...props }, ref) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-56 rounded-inner border border-line bg-surface p-1.5 text-ink shadow-pop",
          className,
        )}
        {...props}
      />
    </RadixDropdown.Portal>
  );
});

export const DropdownMenuItem = forwardRef<
  React.ComponentRef<typeof RadixDropdown.Item>,
  React.ComponentPropsWithoutRef<typeof RadixDropdown.Item>
>(function DropdownMenuItem({ className, ...props }, ref) {
  return (
    <RadixDropdown.Item
      ref={ref}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-mark px-3 text-body outline-none select-none",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-veil",
        "[&>svg]:size-4 [&>svg]:text-muted",
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuLabel = forwardRef<
  React.ComponentRef<typeof RadixDropdown.Label>,
  React.ComponentPropsWithoutRef<typeof RadixDropdown.Label>
>(function DropdownMenuLabel({ className, ...props }, ref) {
  return (
    <RadixDropdown.Label
      ref={ref}
      className={cn("px-3 py-2 text-small text-muted", className)}
      {...props}
    />
  );
});

export const DropdownMenuSeparator = forwardRef<
  React.ComponentRef<typeof RadixDropdown.Separator>,
  React.ComponentPropsWithoutRef<typeof RadixDropdown.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <RadixDropdown.Separator
      ref={ref}
      className={cn("my-1.5 h-px bg-line", className)}
      {...props}
    />
  );
});
