import { BellOff, CalendarClock, GraduationCap, UserPlus, Users } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { devUser } from "@/lib/dev-user";

export default function HomePage() {
  return (
    <>
      <PageHeader
        title={`Bonjour ${devUser.firstName}`}
        subtitle="Voici l'état de l'unité locale aujourd'hui."
        actions={<FakeDataBanner />}
      />

      <section aria-labelledby="chiffres" className="mb-6">
        <h2 id="chiffres" className="sr-only">
          Chiffres clés (données fictives)
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            variant="highlight"
            label="Bénévoles actifs"
            value="128"
            icon={<Users />}
            delta="+4"
            deltaTone="up"
            footer="sur 30 jours"
          />
          <StatCard
            label="Candidats en cours"
            value="11"
            icon={<UserPlus />}
            delta="+2"
            deltaTone="up"
            footer="dossiers à traiter"
          />
          <StatCard
            label="Formations à venir"
            value="3"
            icon={<GraduationCap />}
            footer="dans les 60 jours"
          />
          <StatCard
            variant="dark"
            label="Échéances proches"
            value="7"
            icon={<CalendarClock />}
            delta="−1"
            deltaTone="down"
            footer="recyclages PSE"
          />
        </div>
      </section>

      <section aria-labelledby="rappels">
        <h2 id="rappels" className="sr-only">
          Rappels
        </h2>
        <EmptyState
          icon={<BellOff />}
          title="Aucun rappel pour l'instant"
          description="Les rappels d'échéances et de points de suivi apparaîtront ici à l'étape 12."
        />
      </section>
    </>
  );
}
