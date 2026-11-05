"use server";

import { revalidatePath } from "next/cache";
import { appointmentSchema, cancelSchema, endAppointmentSchema } from "@/lib/trainingForms";
import { toParisDay } from "@/lib/dates";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { loadFunctionFacts, loadPersonFacts } from "@/server/policy/facts";
import type { PolicyResource } from "@/server/policy/types";
import {
  appointmentResourceOf,
  cancelAppointment,
  createAppointment,
  endAppointment,
} from "@/server/services/trainings";

/* Appointments (step 10): the profiles of the function's `managedBy`, and TOPAZE. */

const refresh = () => {
  revalidatePath("/benevoles/[ref]", "page");
};

async function resource(personId: string, referenceId: string): Promise<PolicyResource> {
  const [person, fn] = await Promise.all([
    loadPersonFacts(getDb(), personId, toParisDay()),
    loadFunctionFacts(getDb(), referenceId),
  ]);
  if (!person || !fn) throw new DomainError("INVALID_DATA", "Personne ou fonction introuvable.");
  return { person, function: fn };
}

export const createAppointmentAction = defineAction({
  action: "appointment.write",
  input: appointmentSchema,
  resource: (input) => resource(input.personId, input.referenceId),
  handler: async ({ input, actor }) => {
    const result = await createAppointment(getDb(), actor, input);
    if (result.saved) refresh();
    return result;
  },
});

export const endAppointmentAction = defineAction({
  action: "appointment.write",
  input: endAppointmentSchema,
  resource: (input) => appointmentResourceOf(getDb(), input.id),
  handler: async ({ input, actor }) => {
    await endAppointment(getDb(), actor, { appointmentId: input.id, endDate: input.endDate });
    refresh();
    return null;
  },
});

export const cancelAppointmentAction = defineAction({
  action: "appointment.write",
  input: cancelSchema,
  resource: (input) => appointmentResourceOf(getDb(), input.id),
  handler: async ({ input, actor }) => {
    await cancelAppointment(getDb(), actor, { appointmentId: input.id, reason: input.reason });
    refresh();
    return null;
  },
});
