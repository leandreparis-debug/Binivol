"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { CheckCircle2, Download, FileSpreadsheet, FlaskConical, Lock, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { Field, Select } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { formatDateTime } from "@/lib/dates";
import type { ActionResult } from "@/server/actions/defineAction";
import type { SheetName } from "@/server/import/columns";
import type { ImportRunSummary } from "@/server/import/history";
import type { ImportReport, Issue, IssueLevel, SheetCounts } from "@/server/import/report";
import type { ImportOutcome } from "@/server/import/service";
import { runImportAction, simulateImportAction } from "./actions";

const SHEETS: { key: SheetName; label: string }[] = [
  { key: "Referentiel", label: "Référentiel" },
  { key: "Parametres", label: "Paramètres" },
  { key: "Benevoles", label: "Bénévoles" },
  { key: "Prospects", label: "Prospects" },
  { key: "Sessions", label: "Sessions" },
  { key: "Fonctions", label: "Fonctions" },
  { key: "Journal", label: "Journal" },
];
const LEVELS: Record<IssueLevel, { label: string; tone: "danger" | "warn" | "neutral" | "ink" }> = {
  blocking: { label: "Erreur bloquante", tone: "danger" },
  rejected: { label: "Rejet", tone: "danger" },
  conflict: { label: "Conflit", tone: "ink" },
  warning: { label: "Avertissement", tone: "warn" },
};

function sum(counts: Record<SheetName, SheetCounts>): SheetCounts {
  return Object.values(counts).reduce(
    (a, c) => ({
      created: a.created + c.created,
      updated: a.updated + c.updated,
      unchanged: a.unchanged + c.unchanged,
      conflicts: a.conflicts + c.conflicts,
      rejected: a.rejected + c.rejected,
      warnings: a.warnings + c.warnings,
    }),
    { created: 0, updated: 0, unchanged: 0, conflicts: 0, rejected: 0, warnings: 0 },
  );
}

type IssueRow = Issue & Record<string, unknown> & { id: string };
type SheetRow = SheetCounts & Record<string, unknown> & { id: string; label: string };

function Report({ report, title }: { report: ImportReport; title: string }) {
  const [level, setLevel] = useState<IssueLevel | "">("");
  const [sheet, setSheet] = useState<string>("");
  const levelId = useId();
  const t = sum(report.counts);
  const issues = useMemo<IssueRow[]>(
    () =>
      report.issues
        .filter((i) => (level ? i.level === level : true) && (sheet ? i.sheet === sheet : true))
        .map((i, k) => ({ ...i, id: `${k}` })),
    [report.issues, level, sheet],
  );
  const sheetRows: SheetRow[] = SHEETS.map((s) => ({
    id: s.key,
    label: s.label,
    ...report.counts[s.key],
  }));
  const sheetColumns: DataTableColumn<SheetRow>[] = [
    { key: "label", header: "Onglet" },
    { key: "created", header: "Créées", align: "right" },
    { key: "updated", header: "Mises à jour", align: "right" },
    { key: "unchanged", header: "Inchangées", align: "right" },
    { key: "conflicts", header: "Conflits", align: "right" },
    { key: "rejected", header: "Rejetées", align: "right" },
    { key: "warnings", header: "Avertissements", align: "right" },
  ];
  const issueColumns: DataTableColumn<IssueRow>[] = [
    {
      key: "sheet",
      header: "Onglet",
      cell: (i) => SHEETS.find((sh) => sh.key === i.sheet)?.label ?? i.sheet,
    },
    { key: "row", header: "Ligne", mono: true, cell: (i) => i.row ?? "—" },
    { key: "key", header: "Clé", mono: true },
    {
      key: "level",
      header: "Niveau",
      cell: (i) => <Chip tone={LEVELS[i.level].tone}>{LEVELS[i.level].label}</Chip>,
    },
    { key: "message", header: "Motif" },
  ];
  return (
    <section aria-label={title} className="flex flex-col gap-4" data-testid="import-report">
      <h3 className="text-section text-ink">{title}</h3>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Créées" value={t.created} />
        <StatCard label="Mises à jour" value={t.updated} />
        <StatCard label="Inchangées" value={t.unchanged} />
        <StatCard label="Ignorées pour conflit" value={t.conflicts} />
        <StatCard
          variant="dark"
          label="Rejetées"
          value={t.rejected}
          footer={`${t.warnings} avertissement(s)`}
        />
      </div>
      <DataTable
        caption="Compteurs par onglet"
        columns={sheetColumns}
        rows={sheetRows}
        rowKey={(r) => r.id}
      />
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Niveau" htmlFor={levelId} className="w-56">
          <Select
            id={levelId}
            value={level}
            onChange={(e) => {
              setLevel(e.target.value as IssueLevel | "");
            }}
          >
            <option value="">Tous</option>
            {(Object.keys(LEVELS) as IssueLevel[]).map((l) => (
              <option key={l} value={l}>
                {LEVELS[l].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Onglet" className="w-56">
          <Select
            value={sheet}
            onChange={(e) => {
              setSheet(e.target.value);
            }}
          >
            <option value="">Tous</option>
            <option value="Fichier">Fichier</option>
            {SHEETS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="pb-3 text-small text-muted" aria-live="polite">
          {issues.length} ligne(s)
        </p>
      </div>
      <DataTable
        caption="Rejets, conflits et avertissements"
        columns={issueColumns}
        rows={issues}
        rowKey={(r) => r.id}
        emptyMessage="Aucun rejet ni avertissement."
      />
    </section>
  );
}

function History({ runs }: { runs: ImportRunSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historique des imports</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <p className="text-body text-muted">Aucun import pour l'instant.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line" aria-label="Historique des imports">
            {runs.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                data-testid="import-run"
              >
                <div className="min-w-0">
                  <p className="text-body text-ink">
                    <span className="font-mono text-mono">{formatDateTime(run.startedAt)}</span> ·{" "}
                    {run.actorLabel} · <span className="break-all">{run.fileName}</span>
                  </p>
                  <p className="text-small text-muted">
                    {run.totals
                      ? `${run.totals.created} créées, ${run.totals.updated} mises à jour, ${run.totals.unchanged} inchangées, ${run.totals.conflicts} conflits, ${run.totals.rejected} rejetées`
                      : (run.error ?? "Sans rapport")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={run.dryRun ? "neutral" : "accent"}>
                    {run.dryRun ? "Simulation" : "Import réel"}
                  </Chip>
                  <Chip
                    tone={
                      run.status === "SUCCEEDED"
                        ? run.blocking
                          ? "warn"
                          : "ok"
                        : run.status === "FAILED"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {run.status === "SUCCEEDED"
                      ? run.blocking
                        ? "Erreurs bloquantes"
                        : "Terminé"
                      : run.status === "FAILED"
                        ? "Échec"
                        : "En cours"}
                  </Chip>
                  {run.totals && (
                    <Button asChild variant="outline" leftIcon={<Download className="size-4" />}>
                      <a href={`/api/import/${run.id}/rapport`} download>
                        Rapport CSV
                      </a>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Upload → simulation → real import, on one card, then the history. */
export function ImportWizard({ runs }: { runs: ImportRunSummary[] }) {
  const router = useRouter();
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [simulation, setSimulation] = useState<ImportOutcome | null>(null);
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handle = (
    action: (input: { file: File }) => Promise<ActionResult<ImportOutcome>>,
    after: (o: ImportOutcome) => void,
  ) => {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const response = await action({ file });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      if (!response.data.ok) setError(response.data.error);
      after(response.data);
      router.refresh();
    });
  };

  const canImport = simulation?.ok === true && !simulation.blocking && result === null;
  const persons = simulation?.report?.personCount ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-col items-start gap-2">
          <CardTitle>Importer l'ancien classeur</CardTitle>
          <p
            className="flex items-center gap-2 rounded-inner bg-veil px-3 py-2 text-small text-ink-2"
            data-testid="file-not-kept"
          >
            <Lock aria-hidden="true" className="size-4 shrink-0" />
            Le fichier n'est pas conservé. Seul le rapport est gardé.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ol className="grid gap-4 lg:grid-cols-3">
            <li className="flex flex-col gap-3 rounded-inner bg-veil p-4">
              <p className="text-small font-medium text-muted">1. Déposer</p>
              <label htmlFor={inputId} className="text-body font-medium text-ink">
                Classeur exporté en .xlsx (5 Mo au plus)
              </label>
              <input
                id={inputId}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="min-h-11 w-full rounded-field border border-line bg-surface px-3 py-2 text-[16px] focus-ring sm:text-body"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setSimulation(null);
                  setResult(null);
                  setError(null);
                }}
              />
              {file && (
                <p className="flex items-center gap-2 text-small text-ink-2">
                  <FileSpreadsheet aria-hidden="true" className="size-4" />
                  <span className="break-all">{file.name}</span>
                </p>
              )}
            </li>
            <li className="flex flex-col gap-3 rounded-inner bg-veil p-4">
              <p className="text-small font-medium text-muted">2. Simulation</p>
              <p className="text-body text-ink-2">
                Lit le fichier et montre ce qui serait importé. Rien n'est écrit.
              </p>
              <Button
                variant="outline"
                disabled={!file || pending}
                loading={pending && !confirmOpen && simulation === null}
                leftIcon={<FlaskConical className="size-4" />}
                onClick={() => {
                  setResult(null);
                  handle(simulateImportAction, setSimulation);
                }}
              >
                Lancer la simulation
              </Button>
            </li>
            <li className="flex flex-col gap-3 rounded-inner bg-veil p-4">
              <p className="text-small font-medium text-muted">3. Importer</p>
              <p className="text-body text-ink-2">
                Le même fichier, dans les 30 minutes qui suivent la simulation.
              </p>
              <Button
                disabled={!canImport || pending}
                leftIcon={<Upload className="size-4" />}
                onClick={() => {
                  setConfirmOpen(true);
                }}
              >
                Importer
              </Button>
            </li>
          </ol>

          {error && (
            <p
              role="alert"
              className="rounded-inner bg-danger-soft px-4 py-3 text-body font-medium text-danger-ink"
              data-testid="import-error"
            >
              {error}
            </p>
          )}
          {simulation?.blocking && (
            <p className="rounded-inner bg-warn-soft px-4 py-3 text-body font-medium text-warn-ink">
              Le classeur a des erreurs bloquantes : corrigez-les dans le classeur, puis relancez la
              simulation.
            </p>
          )}
          {result?.ok && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-inner bg-ok-soft px-4 py-3 text-body font-medium text-ok-ink"
              data-testid="import-done"
            >
              <CheckCircle2 aria-hidden="true" className="size-5" />
              Import terminé. Le rapport est disponible dans l'historique.
            </p>
          )}
          {result?.report ? (
            <Report report={result.report} title="Résultat de l'import" />
          ) : simulation?.report ? (
            <Report report={simulation.report} title="Résultat de la simulation" />
          ) : null}
        </CardContent>
      </Card>

      <History runs={runs} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title="Confirmer l'import réel"
          description={
            <>
              Vous allez importer {persons} personne{persons > 1 ? "s" : ""}. L'accord du DPO a-t-il
              été donné ?
            </>
          }
        >
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button
              loading={pending}
              onClick={() => {
                handle(runImportAction, (outcome) => {
                  setResult(outcome);
                  setConfirmOpen(false);
                });
              }}
            >
              Oui, l'accord est donné : importer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
