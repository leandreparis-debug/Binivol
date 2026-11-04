import type { z } from "zod";
import type { PolicyAction } from "@/lib/actions";
import { getActor } from "../auth/actor";
import { DomainError } from "../errors";
import { authorize, ForbiddenError } from "../policy/can";
import type { Actor, PolicyResource } from "../policy/types";

/**
 * The only way to write a Server Action. An architecture test fails if a
 * `'use server'` file exports anything else.
 *
 * `defineAction` validates the input (Zod), resolves the actor from the
 * session (profiles re-read), authorises the action — with the resource
 * returned by `resource()` when the rule is about a person or a function —
 * then calls the handler. Business and permission errors become a typed
 * result; anything else (including Next redirects) is re-thrown.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };

export const FORBIDDEN_MESSAGE = "Vous n'avez pas le droit de faire cette action.";
export const UNAUTHENTICATED_MESSAGE = "Votre session a expiré. Reconnectez-vous.";

function invalidInput(error: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return {
    ok: false,
    error: "Certaines valeurs sont invalides.",
    code: "INVALID_INPUT",
    fieldErrors,
  };
}

function asResult(error: unknown): ActionResult<never> {
  if (error instanceof ForbiddenError)
    return { ok: false, error: FORBIDDEN_MESSAGE, code: "FORBIDDEN" };
  if (error instanceof DomainError) return { ok: false, error: error.message, code: error.code };
  throw error;
}

export interface ActionDefinition<S extends z.ZodType, R> {
  action: PolicyAction;
  input: S;
  /** Facts the rule needs (person, function), computed from the parsed input. */
  resource?: (input: z.infer<S>, actor: Actor) => Promise<PolicyResource>;
  handler: (context: { input: z.infer<S>; actor: Actor }) => Promise<R>;
}

export function defineAction<S extends z.ZodType, R>(definition: ActionDefinition<S, R>) {
  return async function action(raw: unknown): Promise<ActionResult<R>> {
    const parsed = definition.input.safeParse(raw);
    if (!parsed.success) return invalidInput(parsed.error);
    const actor = await getActor();
    if (!actor) return { ok: false, error: UNAUTHENTICATED_MESSAGE, code: "UNAUTHENTICATED" };
    try {
      const resource = definition.resource
        ? await definition.resource(parsed.data, actor)
        : undefined;
      authorize(actor, definition.action, resource);
      return { ok: true, data: await definition.handler({ input: parsed.data, actor }) };
    } catch (error) {
      return asResult(error);
    }
  };
}

/**
 * For the few actions that run without a signed-in responsible (sign-in,
 * sign-out). Same input validation and error handling, no policy check.
 */
export function definePublicAction<S extends z.ZodType, R>(definition: {
  input: S;
  handler: (context: { input: z.infer<S> }) => Promise<R>;
}) {
  return async function action(raw: unknown): Promise<ActionResult<R>> {
    const parsed = definition.input.safeParse(raw);
    if (!parsed.success) return invalidInput(parsed.error);
    try {
      return { ok: true, data: await definition.handler({ input: parsed.data }) };
    } catch (error) {
      return asResult(error);
    }
  };
}
