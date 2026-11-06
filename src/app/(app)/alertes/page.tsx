import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Select } from "@/components/ui/Field";
import { StatusDot } from "@/components/ui/StatusDot";
import { getEnv } from "@/lib/env";
import { alertKey } from "@/lib/status";
import {
  ALERT_CODES,
  ALERT_PRIORITIES,
  ALERT_PRIORITY_LABELS,
  ALERT_RULES,
} from "@/server/alerts/rules";
import { requireActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { alertsPage, parseAlertFilters } from "@/server/services/alerts";
import { remindersNavItems } from "../rappels/navItems";
import { RemindersNav } from "../rappels/RemindersNav";

export const metadata: Metadata = { title: "Alertes" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Alertes (step 12, docs/alertes.md): quality checks computed on the data of
 * the moment, by priority, for the people of the actor's perimeter and the
 * subjects that concern her. A click opens the person at the right tab.
 */
export default async function AlertsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireActor();
  const raw = await searchParams;
  const filters = parseAlertFilters({
    priorite: first(raw.priorite),
    regle: first(raw.regle),
    responsable: first(raw.responsable),
    personne: first(raw.personne),
  });
  const result = await alertsPage(getDb(), actor, filters);
  if (!result) forbidden();
  const { alerts, total, personName } = result;
  const filtered = alerts.length !== total;
  return (
    <>
      <PageHeader
        title="Alertes"
        subtitle="Contrôles calculés sur les données du moment : une alerte disparaît dès que la donnée est corrigée."
        actions={getEnv().AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      <RemindersNav items={remindersNavItems(true)} />
      <div className="mt-6 flex flex-col gap-6">
        <Card>
          <CardContent className="pt-6">
            <form
              method="get"
              className="flex flex-wrap items-end gap-3"
              role="search"
              aria-label="Filtrer les alertes"
            >
              {filters.personRef && (
                <input type="hidden" name="personne" value={filters.personRef} />
              )}
              <Field label="Priorité" htmlFor="alert-priority" className="min-w-40">
                <Select id="alert-priority" name="priorite" defaultValue={filters.priority ?? ""}>
                  <option value="">Toutes</option>
                  {ALERT_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {ALERT_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Règle" htmlFor="alert-rule" className="min-w-56">
                <Select id="alert-rule" name="regle" defaultValue={filters.code ?? ""}>
                  <option value="">Toutes</option>
                  {ALERT_CODES.map((c) => (
                    <option key={c} value={c}>
                      {ALERT_RULES[c].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Responsable" htmlFor="alert-owner" className="min-w-40">
                <Select
                  id="alert-owner"
                  name="responsable"
                  defaultValue={filters.mine ? "moi" : ""}
                >
                  <option value="">Tous</option>
                  <option value="moi">Mes candidats</option>
                </Select>
              </Field>
              <Button type="submit">Filtrer</Button>
              {(filtered || filters.personRef) && (
                <Link
                  href="/alertes"
                  className="inline-flex min-h-11 items-center px-2 text-body text-ink underline-offset-4 focus-ring hover:underline"
                >
                  Effacer les filtres
                </Link>
              )}
            </form>
          </CardContent>
        </Card>
        <p className="text-body text-ink" role="status">
          {alerts.length} alerte{alerts.length > 1 ? "s" : ""}
          {personName ? ` pour ${personName}` : ""}
          {filtered ? ` sur ${String(total)}` : ""}
        </p>
        {alerts.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck />}
            title="Aucune alerte"
            description="Rien à corriger dans ton périmètre pour ces filtres."
          />
        ) : (
          ALERT_PRIORITIES.map((priority) => {
            const group = alerts.filter((a) => a.priority === priority);
            if (group.length === 0) return null;
            return (
              <Card key={priority} data-testid={`alerts-${priority.toLowerCase()}`}>
                <CardHeader>
                  <CardTitle as="h2">
                    Priorité {ALERT_PRIORITY_LABELS[priority].toLowerCase()} ({group.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col divide-y divide-line">
                    {group.slice(0, 300).map((a, i) => (
                      <li
                        key={`${a.code}-${a.personId ?? a.subject}-${String(i)}`}
                        className="flex flex-wrap items-start justify-between gap-2 py-3"
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <Link
                            href={a.href}
                            className="inline-flex min-h-11 items-center text-body text-ink underline-offset-4 focus-ring hover:underline"
                          >
                            {a.subject}
                          </Link>
                          <span className="text-small text-ink-2">
                            {ALERT_RULES[a.code].label} · {a.message}
                          </span>
                        </span>
                        <StatusDot status={alertKey(a.priority)} />
                      </li>
                    ))}
                  </ul>
                  {group.length > 300 && (
                    <p className="pt-3 text-small text-muted">
                      300 premières sur {group.length} : affine les filtres.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
