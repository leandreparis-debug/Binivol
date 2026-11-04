import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Rappels" };

export default function Page() {
  return (
    <>
      <PageHeader title="Rappels" subtitle="Échéances et points de suivi à venir." />
      <EmptyState
        icon={<Bell />}
        title="Arrive à l'étape 12"
        description="Cette section sera disponible lors d'une prochaine étape du projet."
      />
    </>
  );
}
