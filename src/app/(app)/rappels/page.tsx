import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatDateTime } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { canSeeAlerts } from "@/server/alerts/load";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { listNotifications } from "@/server/services/notifications";
import { MarkAllRead } from "./MarkAllRead";
import { remindersNavItems } from "./navItems";
import { RemindersNav } from "./RemindersNav";

export const metadata: Metadata = { title: "Rappels" };
export const dynamic = "force-dynamic";

/**
 * Rappels (step 12): the dated notifications produced by the reminder rules
 * for the signed-in responsible, unread first.
 */
export default async function Page() {
  const actor = await requirePageAccess("notification.readOwn");
  const notifications = await listNotifications(getDb(), actor.userId);
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <>
      <PageHeader
        title="Rappels"
        subtitle="Échéances, relances et points de suivi qui te concernent."
        actions={
          <>
            {getEnv().AUTH_DEMO_LOGIN && <FakeDataBanner />}
            {unread > 0 && <MarkAllRead />}
          </>
        }
      />
      <RemindersNav items={remindersNavItems(canSeeAlerts(actor))} />
      <div className="mt-6">
        {notifications.length === 0 ? (
          <EmptyState
            icon={<Bell />}
            title="Aucun rappel"
            description="Les rappels arrivent chaque matin, selon les règles réglées par TOPAZE."
          />
        ) : (
          <Card>
            <CardContent className="pt-6">
              <ul className="flex flex-col divide-y divide-line" data-testid="notifications">
                {notifications.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      {n.href ? (
                        <Link
                          href={n.href}
                          className="text-body text-ink underline-offset-4 focus-ring hover:underline"
                        >
                          {n.title}
                        </Link>
                      ) : (
                        <span className="text-body text-ink">{n.title}</span>
                      )}
                      {n.body && <span className="text-small text-ink-2">{n.body}</span>}
                      <span className="text-small text-muted">{formatDateTime(n.createdAt)}</span>
                    </span>
                    {n.read ? (
                      <StatusDot status="notif-read" />
                    ) : (
                      <StatusDot status="notif-unread" />
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
