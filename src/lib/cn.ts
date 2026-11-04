import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge configured with Binivol's custom font-size scale, so that
 * `text-small text-white` keeps both (size and colour are different groups).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "figure", "title", "section", "body", "small", "mono"],
      radius: ["card", "inner", "field", "pill"],
      shadow: ["pop"],
    },
  },
});

/**
 * Merges class names, resolving Tailwind conflicts (`p-2 p-4` → `p-4`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
