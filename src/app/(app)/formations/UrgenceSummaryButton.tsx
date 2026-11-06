"use client";

import { Send } from "lucide-react";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { sendUrgenceSummaryAction } from "./actions";

/** « Récapitulatif TCAU »: e-mails the state of the listed trainings to the Urgence pole. */
export function UrgenceSummaryButton({ codes }: { codes: string[] }) {
  const { pending, feedback, run } = useFormAction<number>();
  const label = `Récapitulatif ${codes.join(", ") || "Urgence"}`;
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="outline"
        loading={pending}
        leftIcon={<Send aria-hidden="true" />}
        onClick={() => {
          run(() => sendUrgenceSummaryAction({}), {
            success: "Récapitulatif envoyé au pôle Urgence.",
          });
        }}
      >
        {label}
      </Button>
      <FormMessage feedback={feedback} />
    </div>
  );
}
