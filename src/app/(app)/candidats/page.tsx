import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { requirePageAccess } from "@/server/auth/page";

export const metadata: Metadata = { title: "Candidats" };

export default async function Page() {
  await requirePageAccess("candidacy.manage");
  return (
    <>
      <PageHeader title="Candidats" subtitle="Suivi des candidats et de leur intégration." />
      <EmptyState
        icon={<UserPlus />}
        title="Arrive à l'étape 6"
        description="Cette section sera disponible lors d'une prochaine étape du projet."
      />
    </>
  );
}
