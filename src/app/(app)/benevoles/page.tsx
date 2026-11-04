import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Bénévoles" };

export default function Page() {
  return (
    <>
      <PageHeader title="Bénévoles" subtitle="Annuaire et fiches des bénévoles." />
      <EmptyState
        icon={<Users />}
        title="Arrive à l'étape 5"
        description="Cette section sera disponible lors d'une prochaine étape du projet."
      />
    </>
  );
}
