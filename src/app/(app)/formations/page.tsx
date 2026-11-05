import { redirect } from "next/navigation";
import { requirePageAccess } from "@/server/auth/page";
import { canSome } from "@/server/policy/can";

/** /formations opens on Sessions (FORMAT, TOPAZE), on Trouver otherwise. */
export default async function Page() {
  const actor = await requirePageAccess("training.read");
  redirect(
    canSome(actor, "trainingSession.manage") ? "/formations/sessions" : "/formations/trouver",
  );
}
