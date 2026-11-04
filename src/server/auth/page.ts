import { forbidden } from "next/navigation";
import type { PolicyAction } from "@/lib/actions";
import { can, canSome } from "../policy/can";
import type { Actor, PolicyResource } from "../policy/types";
import { requireActor } from "./actor";

/**
 * Page guard: the signed-in actor (or a redirect to /connexion), and a 403
 * when none of her profiles holds `action`. Pages about one person call
 * `authorizePage` again with the resource once it is loaded.
 */
export async function requirePageAccess(action: PolicyAction): Promise<Actor> {
  const actor = await requireActor();
  if (!canSome(actor, action)) forbidden();
  return actor;
}

/** 403 when `can()` refuses `action` on `resource`. */
export function authorizePage(actor: Actor, action: PolicyAction, resource?: PolicyResource): void {
  if (!can(actor, action, resource).allowed) forbidden();
}
