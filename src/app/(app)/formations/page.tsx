import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Formations" };

export default function Page() {
  return (
    <>
      <PageHeader title="Formations" subtitle="Formations, recyclages et nominations." />
      <EmptyState
        icon={<GraduationCap />}
        title="Arrive à l'étape 10"
        description="Cette section sera disponible lors d'une prochaine étape du projet."
      />
    </>
  );
}
