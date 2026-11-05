import { forbidden, notFound } from "next/navigation";
import { authorizePage, requirePageAccess } from "../auth/page";
import { getDb } from "../db";
import type { Actor, PersonFacts } from "../policy/types";
import { lookupPerson } from "../services/personProfile";

/**
 * Access of the responsible's dossier pages (review, on-site mode):
 * `dossier.manage` on the person; 404 when the person is not visible in the
 * directory, 403 when visible but out of scope.
 */
export async function requireDossierPage(
  ref: string,
): Promise<{ actor: Actor; personId: string; facts: PersonFacts }> {
  const actor = await requirePageAccess("dossier.manage");
  const lookup = await lookupPerson(getDb(), actor, ref);
  if (lookup.status === "notFound") notFound();
  if (lookup.status === "forbidden") forbidden();
  authorizePage(actor, "dossier.manage", { person: lookup.facts });
  return { actor, personId: lookup.personId, facts: lookup.facts };
}
