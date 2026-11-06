import type { Metadata } from "next";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatDate, formatDateTime } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { AUTOMATED_MESSAGE_KIND_LABELS, JOB_RUN_STATUS_LABELS, PROFILE_LABELS } from "@/lib/labels";
import { ALERT_CODES, ALERT_PRIORITY_LABELS, ALERT_RULES } from "@/server/alerts/rules";
import { requirePageAccess } from "@/server/auth/page";
import { DIGEST_FREQUENCIES, DIGEST_FREQUENCY_LABELS } from "@/server/automationSettings";
import { getDb } from "@/server/db";
import { PROFILE_ORDER } from "@/server/services/accounts";
import { automationOverview } from "@/server/services/automationAdmin";
import {
  AlertRulesForm,
  DigestForm,
  GreetingsForm,
  ReminderRuleForm,
  UrgenceForm,
} from "./SettingsForms";

export const metadata: Metadata = { title: "Réglages" };
export const dynamic = "force-dynamic";

/**
 * Réglages (step 12, TOPAZE): alert rules, reminder rules, digest,
 * prévenance Urgence, greetings, and the state of the daily task.
 */
export default async function SettingsPage() {
  const actor = await requirePageAccess("setting.manage");
  const { settings, rules, runs, failures } = await automationOverview(getDb(), actor);
  const profiles = PROFILE_ORDER.map((p) => ({ value: p, label: PROFILE_LABELS[p] }));
  return (
    <>
      <PageHeader
        title="Réglages"
        subtitle="Alertes, rappels et e-mails automatiques. Chaque modification est tracée."
        actions={getEnv().AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle as="h2">Règles d&apos;alerte</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertRulesForm
              rules={ALERT_CODES.map((c) => ({
                code: c,
                label: ALERT_RULES[c].label,
                priority: ALERT_PRIORITY_LABELS[ALERT_RULES[c].priority],
              }))}
              disabled={settings.alertRulesDisabled}
              coreCodes={settings.coreTrainingCodes}
              companions={settings.requiredCompanions}
            />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle as="h2">Règles de rappel</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-line" data-testid="reminder-rules">
              {rules.map((r) => (
                <li key={r.id} className="py-4">
                  <ReminderRuleForm rule={r} profiles={profiles} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">Récapitulatif par e-mail</CardTitle>
          </CardHeader>
          <CardContent>
            <DigestForm
              frequency={settings.digestFrequency}
              options={DIGEST_FREQUENCIES.map((f) => ({
                value: f,
                label: DIGEST_FREQUENCY_LABELS[f],
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">Prévenance du pôle Urgence</CardTitle>
          </CardHeader>
          <CardContent>
            <UrgenceForm
              codes={settings.urgenceNotifyCodes}
              recipients={settings.urgenceNotifyRecipients}
            />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle as="h2">E-mails d&apos;anniversaire</CardTitle>
          </CardHeader>
          <CardContent>
            <GreetingsForm
              enabled={settings.greetingEmailsEnabled}
              birthdayText={settings.birthdayText}
              anniversaryText={settings.anniversaryText}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">Tâche quotidienne</CardTitle>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-body text-muted">
                Pas encore exécutée. Elle tourne chaque jour à 5 h (UTC) si CRON_SECRET est réglé.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-line" data-testid="job-runs">
                {runs.map((run) => (
                  <li key={run.day.toISOString()} className="flex justify-between gap-2 py-2">
                    <span className="text-body text-ink">{formatDate(run.day)}</span>
                    <span className="text-small text-ink-2">
                      {JOB_RUN_STATUS_LABELS[run.status as keyof typeof JOB_RUN_STATUS_LABELS]}
                      {run.finishedAt ? ` à ${formatDateTime(run.finishedAt).slice(-5)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">E-mails automatiques en échec</CardTitle>
          </CardHeader>
          <CardContent>
            {failures.length === 0 ? (
              <p className="text-body text-muted">Aucun échec.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line" data-testid="mail-failures">
                {failures.map((f) => (
                  <li key={f.id} className="flex flex-col py-2">
                    <span className="text-body text-ink">
                      {
                        AUTOMATED_MESSAGE_KIND_LABELS[
                          f.kind as keyof typeof AUTOMATED_MESSAGE_KIND_LABELS
                        ]
                      }
                    </span>
                    <span className="text-small text-ink-2">
                      {formatDateTime(f.createdAt)}
                      {f.error ? ` · ${f.error}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
