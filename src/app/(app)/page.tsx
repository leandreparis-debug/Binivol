import { BellOff, CalendarClock, GraduationCap, UserPlus, Users } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { alertKey } from "@/lib/status";
import { ALERT_PRIORITIES, ALERT_PRIORITY_LABELS } from "@/server/alerts/rules";
import { requireActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { alertsFor, canSeeAlerts } from "@/server/services/alerts";
import { listNotifications } from "@/server/services/notifications";

export default async function HomePage() {
  const actor = await requireActor();
  const firstName = actor.name.trim().split(/\s+/)[0] ?? actor.name;
  const db = getDb();
  const [notifications, alerts] = await Promise.all([
    listNotifications(db, actor.userId, 5),
    canSeeAlerts(actor) ? alertsFor(db, actor) : Promise.resolve(null),
  ]);
  const alertCounts = alerts
    ? Object.fromEntries(
        ALERT_PRIORITIES.map((p) => [p, alerts.filter((a) => a.priority === p).length]),
      )
    : null;
  return (
    <>
      <PageHeader
        title={`Bonjour ${firstName}`}
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

      <section aria-labelledby="rappels" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2" id="rappels">
              Derniers rappels
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <EmptyState
                icon={<BellOff />}
                title="Aucun rappel pour l'instant"
                description="Les rappels d'échéances et de points de suivi arrivent chaque matin."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {notifications.map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-2 py-3">
                    <Link
                      href={n.href ?? "/rappels"}
                      className="inline-flex min-h-11 items-center text-body text-ink underline-offset-4 focus-ring hover:underline"
                    >
                      {n.title}
                    </Link>
                    <StatusDot status={n.read ? "notif-read" : "notif-unread"} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {alertCounts && (
          <Card>
            <CardHeader>
              <CardTitle as="h2">Alertes de ton périmètre</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="flex flex-col divide-y divide-line">
                {ALERT_PRIORITIES.map((p) => (
                  <li key={p} className="flex items-center justify-between gap-2 py-3">
                    <Link
                      href={`/alertes?priorite=${p}`}
                      className="inline-flex min-h-11 items-center text-body text-ink underline-offset-4 focus-ring hover:underline"
                    >
                      Priorité {ALERT_PRIORITY_LABELS[p].toLowerCase()}
                    </Link>
                    <span className="flex items-center gap-3">
                      <span className="text-body font-semibold text-ink tabular-nums">
                        {alertCounts[p]}
                      </span>
                      <StatusDot status={alertKey(p)} />
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
