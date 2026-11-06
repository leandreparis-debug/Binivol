import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { ACCESS_SCOPE_LABELS, AUDIT_ACTION_LABELS } from "@/lib/labels";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { canSome } from "@/server/policy/can";
import {
  ABUSE_THRESHOLD,
  accessLogPage,
  auditLogPage,
  frequentConsultations,
  LOG_PAGE_SIZE,
  parseLogFilters,
} from "@/server/services/logs";
import { listUserNames } from "@/server/services/accounts";

export const metadata: Metadata = { title: "Journaux" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const CELL = "border-b border-line px-3 py-2 text-left align-top";

/**
 * Journaux (step 14, TOPAZE): the audit log and the sensitive consultations,
 * filtered and paginated by the server; CSV export (journaled).
 */
export default async function LogsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageAccess("audit.read");
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, first(v)]));
  const journal = raw.journal === "acces" && canSome(actor, "accessLog.read") ? "acces" : "audit";
  const abuse = journal === "acces" && raw.abus === "1";
  const filters = parseLogFilters(raw);
  const db = getDb();
  const users = await listUserNames(db, actor);
  const audit = journal === "audit" ? await auditLogPage(db, actor, filters) : null;
  const access = journal === "acces" && !abuse ? await accessLogPage(db, actor, filters) : null;
  const frequent = abuse ? await frequentConsultations(db, actor) : null;
  const total = audit?.total ?? access?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LOG_PAGE_SIZE));
  const query = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...raw, ...extra })) if (v) params.set(k, v);
    return params.toString();
  };
  return (
    <>
      <PageHeader
        title="Journaux"
        subtitle="Qui a fait quoi, qui a consulté quoi. Les valeurs sensibles restent masquées."
        actions={getEnv().AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      <nav aria-label="Journaux">
        <ul className="flex flex-wrap gap-2">
          {[
            { key: "audit", href: "/admin/journaux", label: "Journal d'audit" },
            ...(canSome(actor, "accessLog.read")
              ? [
                  {
                    key: "acces",
                    href: "/admin/journaux?journal=acces",
                    label: "Consultations sensibles",
                  },
                ]
              : []),
          ].map((t) => (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={journal === t.key ? "page" : undefined}
                className={
                  journal === t.key
                    ? "inline-flex min-h-11 items-center rounded-control bg-ink px-4 text-body text-white focus-ring"
                    : "inline-flex min-h-11 items-center rounded-control bg-surface px-4 text-body text-ink focus-ring hover:bg-veil"
                }
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-6 flex flex-col gap-4">
        <Card>
          <CardContent className="pt-6">
            <form
              method="get"
              className="flex flex-wrap items-end gap-3"
              role="search"
              aria-label="Filtrer le journal"
            >
              <input type="hidden" name="journal" value={journal} />
              <Field label="Du" htmlFor="log-from" className="w-40">
                <Input id="log-from" name="du" type="date" defaultValue={raw.du ?? ""} />
              </Field>
              <Field label="Au" htmlFor="log-to" className="w-40">
                <Input id="log-to" name="au" type="date" defaultValue={raw.au ?? ""} />
              </Field>
              <Field
                label={journal === "audit" ? "Auteur" : "Utilisateur"}
                htmlFor="log-user"
                className="min-w-44"
              >
                <Select id="log-user" name="auteur" defaultValue={raw.auteur ?? ""}>
                  <option value="">Tous</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Personne" htmlFor="log-person" className="w-36">
                <Input
                  id="log-person"
                  name="personne"
                  placeholder="P-00012"
                  defaultValue={raw.personne ?? ""}
                />
              </Field>
              {journal === "audit" ? (
                <>
                  <Field label="Type d'objet" htmlFor="log-entity" className="w-40">
                    <Input
                      id="log-entity"
                      name="objet"
                      placeholder="Person"
                      defaultValue={raw.objet ?? ""}
                    />
                  </Field>
                  <Field label="Action" htmlFor="log-action" className="min-w-40">
                    <Select id="log-action" name="action" defaultValue={raw.action ?? ""}>
                      <option value="">Toutes</option>
                      {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              ) : (
                <Field label="Portée" htmlFor="log-scope" className="min-w-48">
                  <Select id="log-scope" name="portee" defaultValue={raw.portee ?? ""}>
                    <option value="">Toutes</option>
                    {Object.entries(ACCESS_SCOPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Button type="submit">Filtrer</Button>
              <a
                href={`/api/exports/journal?${query({ page: "" })}`}
                download
                className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-4 text-small font-medium text-ink focus-ring hover:bg-veil"
              >
                <Download aria-hidden="true" className="size-4" /> Exporter (CSV)
              </a>
            </form>
          </CardContent>
        </Card>
        {journal === "acces" && (
          <Link
            href={abuse ? "/admin/journaux?journal=acces" : "/admin/journaux?journal=acces&abus=1"}
            className="inline-flex min-h-11 items-center self-start text-body text-ink underline underline-offset-4 focus-ring"
          >
            {abuse
              ? "Voir toutes les consultations"
              : `Consultations répétées : ${String(ABUSE_THRESHOLD)} fois ou plus la même personne en 24 h`}
          </Link>
        )}
        {!abuse && (
          <p className="text-body text-ink" role="status">
            {total} ligne{total > 1 ? "s" : ""}, page {filters.page} sur {pages}
          </p>
        )}
        <Card>
          <CardContent
            className="overflow-x-auto p-0 focus-ring"
            tabIndex={0}
            role="region"
            aria-label="Lignes du journal (défilement horizontal)"
          >
            {audit && (
              <table className="w-full text-small" data-testid="audit-log">
                <caption className="sr-only">Journal d&apos;audit</caption>
                <thead>
                  <tr className="text-muted">
                    {["Date", "Auteur", "Action", "Objet", "Champ", "Avant", "Après"].map((h) => (
                      <th key={h} scope="col" className={`${CELL} font-medium`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {audit.rows.map((r) => (
                    <tr key={r.id}>
                      <td className={`${CELL} whitespace-nowrap`}>{formatDateTime(r.at)}</td>
                      <td className={CELL}>{r.author}</td>
                      <td className={CELL}>{AUDIT_ACTION_LABELS[r.action]}</td>
                      <td className={`${CELL} font-mono`}>
                        {r.entity}
                        <span className="block text-muted">{r.entityId}</span>
                      </td>
                      <td className={CELL}>{r.field}</td>
                      <td className={`${CELL} max-w-64 break-words`}>{r.oldValue}</td>
                      <td className={`${CELL} max-w-64 break-words`}>{r.newValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {access && (
              <table className="w-full text-small" data-testid="access-log">
                <caption className="sr-only">Journal des consultations</caption>
                <thead>
                  <tr className="text-muted">
                    {["Date", "Utilisateur", "Personne", "Portée", "Contexte"].map((h) => (
                      <th key={h} scope="col" className={`${CELL} font-medium`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {access.rows.map((r) => (
                    <tr key={r.id}>
                      <td className={`${CELL} whitespace-nowrap`}>{formatDateTime(r.at)}</td>
                      <td className={CELL}>{r.user}</td>
                      <td className={CELL}>{r.person}</td>
                      <td className={CELL}>{ACCESS_SCOPE_LABELS[r.scope]}</td>
                      <td className={CELL}>{r.context}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {frequent && (
              <table className="w-full text-small" data-testid="frequent-log">
                <caption className="sr-only">Consultations répétées sur 24 heures</caption>
                <thead>
                  <tr className="text-muted">
                    {["Utilisateur", "Personne", "Consultations", "Première", "Dernière"].map(
                      (h) => (
                        <th key={h} scope="col" className={`${CELL} font-medium`}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {frequent.length === 0 && (
                    <tr>
                      <td colSpan={5} className={CELL}>
                        Aucune consultation répétée sur les dernières 24 heures.
                      </td>
                    </tr>
                  )}
                  {frequent.map((r) => (
                    <tr key={`${r.user}-${r.person}`}>
                      <td className={CELL}>{r.user}</td>
                      <td className={CELL}>{r.person}</td>
                      <td className={CELL}>{r.count}</td>
                      <td className={CELL}>{formatDateTime(r.first)}</td>
                      <td className={CELL}>{formatDateTime(r.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        {!abuse && pages > 1 && (
          <nav aria-label="Pages du journal" className="flex gap-2">
            {filters.page > 1 && (
              <Link
                href={`/admin/journaux?${query({ page: String(filters.page - 1) })}`}
                className="inline-flex min-h-11 items-center rounded-control bg-surface px-4 text-body text-ink focus-ring"
              >
                Page précédente
              </Link>
            )}
            {filters.page < pages && (
              <Link
                href={`/admin/journaux?${query({ page: String(filters.page + 1) })}`}
                className="inline-flex min-h-11 items-center rounded-control bg-surface px-4 text-body text-ink focus-ring"
              >
                Page suivante
              </Link>
            )}
          </nav>
        )}
      </div>
    </>
  );
}
