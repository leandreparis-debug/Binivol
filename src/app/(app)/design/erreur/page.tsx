import { notFound } from "next/navigation";
import { isDesignPageEnabled } from "../enabled";

/** Evaluated at request time so the environment toggle works after the build. */
export const dynamic = "force-dynamic";

/**
 * Throws on purpose so the global `error.tsx` can be checked end to end.
 * Only reachable when the design page is enabled.
 */
export default function ErrorDemoPage() {
  if (!isDesignPageEnabled()) notFound();
  throw new Error("Erreur de démonstration (volontaire)");
}
