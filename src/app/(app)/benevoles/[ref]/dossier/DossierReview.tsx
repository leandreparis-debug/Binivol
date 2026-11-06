"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Eye, FileDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Chip } from "@/components/ui/Chip";
import { CopyAllButton, CopyField } from "@/components/ui/CopyField";
import { Select } from "@/components/ui/Field";
import {
  COPY_PREFS_STORAGE_KEY,
  copyEntries,
  DEFAULT_COPY_PREFS,
  tabulated,
  valueForCopy,
  type CopyPrefs,
} from "@/lib/copyFormat";
import { formatDateTime } from "@/lib/dates";
import { DOCUMENT_KIND_LABELS } from "@/lib/labels";
import type { ComparisonRow, ReportKey } from "@/server/dossier/compare";
import type { DossierReview as Review } from "@/server/dossier/store";
import { applyDossierAction, readDossierReviewAction } from "../dossierActions";

const GROUP_ORDER = [
  "Identité et coordonnées",
  "Naissance et adresse",
  "Personne à prévenir",
  "Profil",
  "Pour information",
];

/** Copy preferences, remembered in this browser only (a convenience: defaults otherwise). */
function useCopyPrefs(): [CopyPrefs, (next: CopyPrefs) => void] {
  const [prefs, setPrefs] = useState<CopyPrefs>(DEFAULT_COPY_PREFS);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COPY_PREFS_STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as Partial<CopyPrefs>) : {};
      setPrefs({
        phone: stored.phone === "compact" ? "compact" : "international",
        address: stored.address === "oneLine" ? "oneLine" : "fields",
      });
    } catch {
      // Private window, blocked storage: the defaults apply.
    }
  }, []);
  const save = (next: CopyPrefs) => {
    setPrefs(next);
    try {
      window.localStorage.setItem(COPY_PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not remembered: fine.
    }
  };
  return [prefs, save];
}

const copyRows = (rows: readonly ComparisonRow[]) =>
  rows.map((r) => ({ key: r.key, label: r.label, value: r.proposed }));

function initialSelection(rows: ComparisonRow[]): Set<ReportKey> {
  return new Set(
    rows.filter((r) => r.reportable && r.defaultChecked).map((r) => r.key as ReportKey),
  );
}

/**
 * Review of a submitted dossier: shown on demand (journaled consultation),
 * three columns (field, page, dossier), the fields to report checked by
 * default when the page is empty, then one report in one transaction.
 */
export function DossierReview({ personId }: { personId: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [selected, setSelected] = useState<Set<ReportKey>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [applying, startApplying] = useTransition();
  const [prefs, setPrefs] = useCopyPrefs();

  const load = (after?: string) => {
    setError(null);
    startLoading(async () => {
      const result = await readDossierReviewAction({ personId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReview(result.data);
      setSelected(after ? new Set() : initialSelection(result.data.rows));
      setDone(after ?? null);
    });
  };

  if (!review) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 pt-6">
          <p className="text-body text-ink-2">
            Le dossier contient des données sensibles (naissance, adresse, personne à prévenir). Sa
            consultation est journalisée.
          </p>
          <Button
            leftIcon={<Eye aria-hidden="true" />}
            loading={loading}
            onClick={() => {
              load();
            }}
          >
            Afficher le dossier
          </Button>
          {error && (
            <p role="alert" className="text-small font-medium text-danger-ink">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const rows = review.rows.filter((r) => r.current !== null || r.proposed !== null);
  const groups = GROUP_ORDER.map((g) => ({
    name: g,
    rows: rows.filter((r) => r.group === g),
  })).filter((g) => g.rows.length > 0);
  const toggle = (key: ReportKey, value: boolean) => {
    setSelected((s) => {
      const next = new Set(s);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  };
  const apply = () => {
    setError(null);
    setDone(null);
    startApplying(async () => {
      const result = await applyDossierAction({
        personId,
        submissionId: review.submissionId,
        keys: [...selected],
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      load(
        result.data.written > 0
          ? `Report effectué : ${String(result.data.written)} valeur(s) écrite(s) dans la fiche.`
          : "Rien à écrire : la fiche avait déjà ces valeurs.",
      );
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Copier le dossier"
        className="flex flex-col gap-3 rounded-card bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <CopyAllButton
          variant="primary"
          getText={() => tabulated(copyEntries(copyRows(groups.flatMap((g) => g.rows)), prefs))}
        >
          Tout copier
        </CopyAllButton>
        <label className="flex flex-col gap-1 text-small font-medium text-ink">
          Téléphones copiés
          <Select
            value={prefs.phone}
            onChange={(e) => {
              setPrefs({ ...prefs, phone: e.target.value as CopyPrefs["phone"] });
            }}
          >
            <option value="international">+33 6 12 34 56 78</option>
            <option value="compact">0612345678 (sans espaces)</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-small font-medium text-ink">
          Adresse copiée
          <Select
            value={prefs.address}
            onChange={(e) => {
              setPrefs({ ...prefs, address: e.target.value as CopyPrefs["address"] });
            }}
          >
            <option value="fields">Champ par champ</option>
            <option value="oneLine">En une ligne</option>
          </Select>
        </label>
      </section>
      <p className="text-small text-muted">
        Envoyé le {formatDateTime(review.submittedAt)}. Les champs cochés seront écrits dans la
        fiche ; les autres sont laissés tels quels. Le NIVOL et l&apos;e-mail Croix-Rouge déclarés
        ne sont jamais reportés : ils se vérifient à l&apos;étape Gaia.
      </p>
      {groups.map((group) => (
        <Card key={group.name}>
          <CardHeader>
            <CardTitle as="h2">{group.name}</CardTitle>
            <CopyAllButton
              ariaLabel={`Copier la section ${group.name}`}
              getText={() => tabulated(copyEntries(copyRows(group.rows), prefs))}
            >
              Copier la section
            </CopyAllButton>
          </CardHeader>
          <CardContent>
            <div
              className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_7rem] gap-3 border-b border-line pb-2 text-small font-medium text-muted sm:grid"
              aria-hidden="true"
            >
              <span>Champ</span>
              <span>Fiche actuelle</span>
              <span>Dossier</span>
              <span>Reporter</span>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {group.rows.map((row) => (
                <ReviewRow
                  key={row.key}
                  row={row}
                  copyText={
                    row.proposed === null ? null : valueForCopy(row.key, row.proposed, prefs)
                  }
                  checked={selected.has(row.key as ReportKey)}
                  onToggle={(value) => {
                    toggle(row.key as ReportKey, value);
                  }}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      {review.attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Pièces jointes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {review.attachments.map((a) => (
                <li key={`${a.kind}-${a.fileName}`} className="flex items-center gap-2">
                  <span className="text-small text-muted">{DOCUMENT_KIND_LABELS[a.kind]}</span>
                  {a.documentId ? (
                    <a
                      href={`/api/documents/${a.documentId}`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-control text-body text-ink underline focus-ring"
                    >
                      <FileDown className="size-4" aria-hidden="true" />
                      {a.fileName}
                    </a>
                  ) : (
                    <span className="text-body text-ink">{a.fileName}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-small text-muted">
              Elles sont aussi dans l&apos;onglet Documents de la fiche.
            </p>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-col gap-2 rounded-card bg-surface p-4">
        {error && (
          <p role="alert" className="text-small font-medium text-danger-ink">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="text-small font-medium text-ok-ink">
            {done}
          </p>
        )}
        <Button size="lg" loading={applying} disabled={selected.size === 0} onClick={apply}>
          Reporter dans la fiche ({selected.size})
        </Button>
      </div>
    </div>
  );
}

function ReviewRow({
  row,
  checked,
  onToggle,
  copyText,
}: {
  row: ComparisonRow;
  checked: boolean;
  onToggle: (value: boolean) => void;
  /** What « Copier » writes (the dossier's value, formatted), or null. */
  copyText: string | null;
}) {
  return (
    <li
      className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_7rem] sm:items-center sm:gap-3"
      data-testid={`review-${row.key}`}
    >
      <span className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
        {row.label}
        {row.differs && row.current !== null && <Chip tone="accent">Différent</Chip>}
      </span>
      <span className="text-body break-words text-ink-2">
        <span className="text-small text-muted sm:sr-only">Fiche actuelle : </span>
        {row.current ?? <span className="text-muted">—</span>}
      </span>
      <span className="text-body break-words text-ink">
        <span className="text-small text-muted sm:sr-only">Dossier : </span>
        {row.proposed ?? <span className="text-muted">—</span>}
        {copyText !== null && <CopyField label={row.label} text={copyText} className="ml-1" />}
        {row.warning && (
          <span className="mt-1 flex items-center gap-1.5 text-small text-warn-ink">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {row.warning}
          </span>
        )}
      </span>
      <span>
        {row.reportable && row.differs ? (
          <Checkbox
            label={<span className="sm:sr-only">Reporter</span>}
            aria-label={`Reporter « ${row.label} »`}
            checked={checked}
            onChange={(e) => {
              onToggle(e.target.checked);
            }}
          />
        ) : (
          <span className="text-small text-muted">
            {row.target === "info" ? "Non reporté" : row.proposed === null ? "" : "Identique"}
          </span>
        )}
      </span>
    </li>
  );
}
