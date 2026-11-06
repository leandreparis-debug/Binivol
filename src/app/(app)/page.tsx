import { BellOff } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatDayWithWeekday } from "@/lib/dates";
import { alertKey } from "@/lib/status";
import { ALERT_PRIORITIES, ALERT_PRIORITY_LABELS } from "@/server/alerts/rules";
import { requireActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { alertsFor, canSeeAlerts } from "@/server/services/alerts";
import { dashboardFor } from "@/server/services/dashboard";
import { listNotifications } from "@/server/services/notifications";
import { DashboardBlocks } from "./DashboardBlocks";
import { MyTodosCard } from "./MyTodosCard";

export default async function HomePage() {
  const actor = await requireActor();
  const firstName = actor.name.trim().split(/\s+/)[0] ?? actor.name;
  const db = getDb();
  const [blocks, notifications, alerts] = await Promise.all([
    dashboardFor(db, actor),
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
        eyebrow={formatDayWithWeekday(new Date())}
        subtitle="Voici l'état de l'unité locale aujourd'hui."
        actions={<FakeDataBanner />}
      />

      <DashboardBlocks blocks={blocks} />

      <section aria-labelledby="mes-taches" className="mt-8">
        <MyTodosCard actor={actor} />
      </section>

      <section aria-labelledby="rappels" className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
              <ul className="flex flex-col gap-2">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className="flex items-center justify-between gap-3 rounded-inner bg-veil/60 px-4 py-1"
                  >
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
