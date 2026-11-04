import { getEnv } from "@/lib/env";

/** The design page is always on in development, opt-in in production. */
export function isDesignPageEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || getEnv().ENABLE_DESIGN_PAGE;
}
