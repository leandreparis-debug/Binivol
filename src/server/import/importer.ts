import type { Prisma } from "@/generated/prisma/client";
import type { ReferenceCategory, ReferenceKind } from "@/generated/prisma/enums";
import { normalizeNivol } from "@/lib/nivol";
import { REFERENCE_CATEGORY_LABELS } from "@/lib/labels";
import { diffRecords, withAudit, type AuditRecorder } from "../audit";
import type { Tx } from "../db";
import { computeExpiresAt } from "../reference";
import {
  loadSensitiveForImport,
  writeSensitiveForImport,
  type ImportedSensitive,
} from "../sensitive";
import { IMPORT_ORDER, type SheetName } from "./columns";
import { emptyCounts, type Issue, type SheetCounts } from "./report";
import {
  cellText,
  journalHash,
  maskJournalRow,
  normalizeEmailCell,
  parsePhoneCell,
  journalValueText,
  parisMidnight,
  parseAptitude,
  parseCancellation,
  parseDay,
  parseInstant,
  parseInteger,
  parseResult,
  parseStage,
  parseStatus,
  parseYesNo,
  valueKey,
  type Cell,
  type JournalRow,
  type Parsed,
} from "./values";
import type { ParsedWorkbook, SheetRow } from "./workbook";

/**
 * The import engine. One pass per sheet, in order, computing for every row
 * whether it is created, updated, unchanged, ignored for conflict or
 * rejected. With `apply: false` (simulation) it only reads; with
 * `apply: true` it writes through the same code path, so the simulation
 * report is exactly what the real import will do.
 *
 * - keys: NIVOL for people, the legacy ID (`legacyRef`) for prospects,
 *   trainings and appointments, the code for the reference list, the key for
 *   settings, a SHA-256 for journal rows (`legacyHash`);
 * - it never deletes anything;
 * - conflict: a row whose Binivol entity has a non-IMPORT audit entry since
 *   its last import is not overwritten.
 */

export interface ImportContext {
  apply: boolean;
  /** Instant of the import. */
  now: Date;
  /** Paris calendar day of the import (00:00 UTC). */
  today: Date;
  /** Who runs the import (TOPAZE account, or null from the CLI). */
  actorUserId: string | null;
  /** Test hook: called after each sheet (to provoke a failure in the middle). */
  afterSheet?: (sheet: SheetName) => void | Promise<void>;
}

export interface ImportResult {
  counts: Record<SheetName, SheetCounts>;
  issues: Issue[];
  personCount: number;
}

type Outcome = "created" | "updated" | "unchanged";

class Collector {
  counts = emptyCounts();
  issues: Issue[] = [];
  personCount = 0;

  warn(sheet: SheetName, row: number, key: string | null, message: string) {
    this.issues.push({ sheet, row, key, level: "warning", message });
    this.counts[sheet].warnings += 1;
  }
  reject(sheet: SheetName, row: number, key: string | null, message: string) {
    this.issues.push({ sheet, row, key, level: "rejected", message });
    this.counts[sheet].rejected += 1;
  }
  conflict(sheet: SheetName, row: number, key: string | null, fields: string[]) {
    this.issues.push({
      sheet,
      row,
      key,
      level: "conflict",
      message: `Modifiée dans Binivol depuis le dernier import : non écrasée (champs ${fields.join(", ")}).`,
    });
    this.counts[sheet].conflicts += 1;
  }
  done(sheet: SheetName, outcome: Outcome) {
    this.counts[sheet][outcome] += 1;
  }
  /** Records the warning of a parsed value, if any, and returns the value. */
  take<T>(sheet: SheetName, row: number, key: string | null, column: string, parsed: Parsed<T>): T {
    if (parsed.warning) this.warn(sheet, row, key, `${column} : ${parsed.warning}`);
    return parsed.value;
  }
}

const NO_AUDIT: AuditRecorder = {
  created: () => undefined,
  updated: () => 0,
  cancelled: () => undefined,
  archived: () => undefined,
  log: () => undefined,
};

/** True when the entity was changed in Binivol (non-IMPORT audit) since its last import. */
async function locallyModified(tx: Tx, entity: string, entityId: string): Promise<boolean> {
  const lastImport = await tx.auditLog.findFirst({
    where: { entity, entityId, action: "IMPORT" },
    orderBy: { at: "desc" },
    select: { at: true },
  });
  const local = await tx.auditLog.count({
    where: {
      entity,
      entityId,
      action: { not: "IMPORT" },
      ...(lastImport ? { at: { gt: lastImport.at } } : {}),
    },
  });
  return local > 0;
}

/** Fields of `desired` whose value differs from `current`. */
function changes(
  entity: string,
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
): string[] {
  return diffRecords(entity, current, desired).map((c) => c.field);
}

function pick(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, row[k]]));
}

const txt = (cells: Record<string, Cell>, column: string) => cellText(cells[column] ?? null);
const cell = (cells: Record<string, Cell>, column: string): Cell => cells[column] ?? null;

interface PersonRef {
  id: string | null;
  birthDate: Date | null;
}

/** Runs the import of a parsed workbook. Call inside a transaction. */
export async function importWorkbook(
  tx: Tx,
  parsed: ParsedWorkbook,
  ctx: ImportContext,
): Promise<ImportResult> {
  const out = new Collector();
  const run = async (db: Tx, audit: AuditRecorder) => {
    const people = new Map<string, PersonRef>();
    const existing = await db.person.findMany({
      where: { nivol: { not: null } },
      select: { id: true, nivol: true },
    });
    for (const p of existing) if (p.nivol) people.set(p.nivol, { id: p.id, birthDate: null });

    for (const sheet of IMPORT_ORDER) {
      const rows = parsed.sheets[sheet] ?? [];
      switch (sheet) {
        case "Referentiel":
          await importReference(db, audit, rows, out, ctx);
          break;
        case "Parametres":
          await importSettings(db, audit, rows, out, ctx);
          break;
        case "Benevoles":
          await importVolunteers(db, audit, rows, out, ctx, people);
          break;
        case "Prospects":
          await importProspects(db, audit, rows, out, ctx, people);
          break;
        case "Sessions":
          await importTrainings(db, audit, rows, out, ctx, people);
          break;
        case "Fonctions":
          await importAppointments(db, audit, rows, out, ctx, people);
          break;
        case "Journal":
          await importJournal(db, rows, out, ctx);
          break;
      }
      await ctx.afterSheet?.(sheet);
    }
  };

  if (ctx.apply) {
    await withAudit(tx, { userId: ctx.actorUserId, label: "Import" }, (db, audit) =>
      run(db, audit),
    );
  } else {
    await run(tx, NO_AUDIT);
  }
  return { counts: out.counts, issues: out.issues, personCount: out.personCount };
}

// ---------------------------------------------------------------------------
// Referentiel: compared with the database, never overwritten.
// ---------------------------------------------------------------------------

const KIND_BY_KEY: Record<string, ReferenceKind> = {
  training: "TRAINING",
  formation: "TRAINING",
  function: "FUNCTION",
  fonction: "FUNCTION",
};
/** Labels of the real workbook (« Formation IS », « Tronc commun », « Secours »). */
const LEGACY_CATEGORY_LABELS: Record<string, ReferenceCategory> = {
  "Formation IS": "FORMATION_IS",
  "Tronc commun": "TRONC_COMMUN",
  Secours: "SECOURS",
};
const CATEGORY_BY_KEY = new Map<string, ReferenceCategory>([
  ...(Object.keys(REFERENCE_CATEGORY_LABELS) as ReferenceCategory[]).flatMap(
    (c): [string, ReferenceCategory][] => [
      [valueKey(c), c],
      [valueKey(c.replace("_", " ")), c],
      [valueKey(REFERENCE_CATEGORY_LABELS[c]), c],
    ],
  ),
  ...Object.entries(LEGACY_CATEGORY_LABELS).map(([label, c]): [string, ReferenceCategory] => [
    valueKey(label),
    c,
  ]),
]);

/** Category and kind of a Referentiel row, from codes or legacy labels (exported for tests). */
export function legacyCategory(text: string): ReferenceCategory | undefined {
  return CATEGORY_BY_KEY.get(valueKey(text));
}
export function legacyKind(text: string): ReferenceKind | undefined {
  return KIND_BY_KEY[valueKey(text)];
}

async function importReference(
  db: Tx,
  audit: AuditRecorder,
  rows: SheetRow[],
  out: Collector,
  ctx: ImportContext,
) {
  const S = "Referentiel";
  const items = new Map((await db.referenceItem.findMany()).map((i) => [i.code, i]));
  const seen = new Set<string>();
  for (const { row, cells } of rows) {
    const code = txt(cells, "Code")?.toUpperCase().replace(/\s+/g, "_") ?? null;
    if (!code) {
      out.reject(S, row, null, "Code manquant.");
      continue;
    }
    if (seen.has(code)) {
      out.reject(S, row, code, "Code en double dans l'onglet.");
      continue;
    }
    seen.add(code);
    const label = txt(cells, "Libellé");
    const categoryText = txt(cells, "Catégorie");
    const category = categoryText ? CATEGORY_BY_KEY.get(valueKey(categoryText)) : undefined;
    const kindText = txt(cells, "Type");
    const kind = kindText ? KIND_BY_KEY[valueKey(kindText)] : undefined;
    const endOfYear = out.take(
      S,
      row,
      code,
      "Échéance au 31/12",
      parseYesNo(cell(cells, "Échéance au 31/12")),
    );
    const minors = out.take(
      S,
      row,
      code,
      "Interdite aux mineurs",
      parseYesNo(cell(cells, "Interdite aux mineurs")),
    );
    const item = items.get(code);

    if (!item) {
      out.warn(S, row, code, "Code absent de Binivol : créé inactif, à vérifier.");
      if (ctx.apply) {
        const created = await db.referenceItem.create({
          data: {
            code,
            label: label ?? code,
            category: category ?? "AUTRE",
            kind: kind ?? "TRAINING",
            sortOrder: out.take(S, row, code, "Ordre", parseInteger(cell(cells, "Ordre"))) ?? 999,
            expiresEndOfYear: endOfYear ?? false,
            forbiddenForMinors: minors ?? false,
            active: false,
            note: txt(cells, "Source / commentaire"),
            createdById: ctx.actorUserId,
            updatedById: ctx.actorUserId,
          },
        });
        audit.created("ReferenceItem", created.id, created, { action: "IMPORT" });
      }
      out.done(S, "created");
      continue;
    }
    const diffs: string[] = [];
    if (label && label !== item.label)
      diffs.push(`libellé « ${label} » (Binivol : « ${item.label} »)`);
    if (categoryText && category !== item.category)
      diffs.push(`catégorie « ${categoryText} » (Binivol : ${item.category})`);
    if (kindText && kind !== item.kind) diffs.push(`type « ${kindText} » (Binivol : ${item.kind})`);
    if (endOfYear !== null && endOfYear !== item.expiresEndOfYear) {
      diffs.push(
        `échéance au 31/12 ${endOfYear ? "OUI" : "NON"} (Binivol : ${item.expiresEndOfYear ? "OUI" : "NON"})`,
      );
    }
    if (minors !== null && minors !== item.forbiddenForMinors) {
      diffs.push(
        `interdite aux mineurs ${minors ? "OUI" : "NON"} (Binivol : ${item.forbiddenForMinors ? "OUI" : "NON"})`,
      );
    }
    if (diffs.length > 0)
      out.warn(
        S,
        row,
        code,
        `Différent du référentiel de Binivol, non écrasé : ${diffs.join(" ; ")}.`,
      );
    out.done(S, "unchanged");
  }
}

// ---------------------------------------------------------------------------
// Parametres
// ---------------------------------------------------------------------------

const PARAMETERS: Record<string, { key: string; type: "int" | "text" | "bool" }> = {
  DELAI_ALERTE_JOURS: { key: "ALERT_DAYS_BEFORE_EXPIRY", type: "int" },
  CONSERVATION_ANS: { key: "RETENTION_YEARS_AFTER_LEAVE", type: "int" },
  SAUVEGARDES_A_GARDER: { key: "BACKUPS_TO_KEEP", type: "int" },
  CLASSIFICATION: { key: "DATA_CLASSIFICATION", type: "text" },
  MAILS_VOEUX_ACTIFS: { key: "GREETING_EMAILS_ENABLED", type: "bool" },
};

export const NOT_IMPORTED_PARAMETERS: Record<string, string> = {
  EMAILS_ALERTES:
    "non repris : les destinataires des rappels sont définis par profil dans Binivol.",
  EDITEURS: "non repris : comptes à créer depuis l'administration.",
  DOSSIER_SAUVEGARDE_ID: "non repris : dossier Google Drive, remplacé par le stockage de Binivol.",
  DOSSIER_BENEVOLES_ID: "non repris : dossier Google Drive, remplacé par le stockage de Binivol.",
  VERSION: "non repris : version de l'ancien outil.",
};

async function importSettings(
  db: Tx,
  audit: AuditRecorder,
  rows: SheetRow[],
  out: Collector,
  ctx: ImportContext,
) {
  const S = "Parametres";
  const settings = new Map((await db.setting.findMany()).map((s) => [s.key, s]));
  for (const { row, cells } of rows) {
    const legacyKey = txt(cells, "Clé")?.toUpperCase() ?? null;
    if (!legacyKey) {
      out.reject(S, row, null, "Clé manquante.");
      continue;
    }
    const skipped = NOT_IMPORTED_PARAMETERS[legacyKey];
    if (skipped) {
      out.warn(S, row, legacyKey, `Paramètre ${skipped}`);
      continue;
    }
    const target = PARAMETERS[legacyKey];
    if (!target) {
      out.warn(S, row, legacyKey, "Paramètre inconnu, non repris.");
      continue;
    }
    const raw = cell(cells, "Valeur");
    const parsedValue: Parsed<number | boolean | string | null> =
      target.type === "int"
        ? parseInteger(raw)
        : target.type === "bool"
          ? parseYesNo(raw)
          : { value: cellText(raw) };
    const value = out.take(S, row, legacyKey, "Valeur", parsedValue);
    if (value === null) {
      out.reject(S, row, legacyKey, "Valeur absente ou illisible.");
      continue;
    }
    const current = settings.get(target.key);
    if (!current) {
      if (ctx.apply) {
        const created = await db.setting.create({
          data: {
            key: target.key,
            value,
            description: txt(cells, "Description"),
            createdById: ctx.actorUserId,
          },
        });
        audit.created("Setting", created.id, created, { action: "IMPORT" });
      }
      out.done(S, "created");
      continue;
    }
    if (JSON.stringify(current.value) === JSON.stringify(value)) {
      out.done(S, "unchanged");
      continue;
    }
    if (await locallyModified(db, "Setting", current.id)) {
      out.conflict(S, row, legacyKey, ["value"]);
      continue;
    }
    if (ctx.apply) {
      await db.setting.update({
        where: { id: current.id },
        data: { value, updatedById: ctx.actorUserId },
      });
      audit.updated(
        "Setting",
        current.id,
        { value: current.value },
        { value },
        { action: "IMPORT" },
      );
    }
    out.done(S, "updated");
  }
}

// ---------------------------------------------------------------------------
// Benevoles → Person + PersonSensitive (key: NIVOL)
// ---------------------------------------------------------------------------

async function importVolunteers(
  db: Tx,
  audit: AuditRecorder,
  rows: SheetRow[],
  out: Collector,
  ctx: ImportContext,
  people: Map<string, PersonRef>,
) {
  const S = "Benevoles";
  const seen = new Map<string, number>();
  const nivols = rows
    .map((r) => normalizeNivol(txt(r.cells, "NIVOL")))
    .filter((n): n is string => n !== null);
  const current = new Map(
    (await db.person.findMany({ where: { nivol: { in: nivols } } })).map((p) => [p.nivol ?? "", p]),
  );
  const sensitive = await loadSensitiveForImport(
    db,
    [...current.values()].map((p) => p.id),
  );

  for (const { row, cells } of rows) {
    const rawNivol = txt(cells, "NIVOL");
    const nivol = normalizeNivol(rawNivol);
    if (!rawNivol) {
      out.reject(S, row, null, "NIVOL manquant.");
      continue;
    }
    if (!nivol) {
      out.reject(
        S,
        row,
        rawNivol,
        `NIVOL invalide « ${rawNivol} » (11 chiffres suivis d'une lettre attendus).`,
      );
      continue;
    }
    const firstSeen = seen.get(nivol);
    if (firstSeen !== undefined) {
      out.reject(S, row, nivol, `NIVOL en double : déjà présent ligne ${firstSeen}.`);
      continue;
    }
    seen.set(nivol, row);
    const firstName = txt(cells, "Prénom");
    const lastName = txt(cells, "Nom");
    if (!firstName || !lastName) {
      out.reject(S, row, nivol, "Prénom ou nom manquant.");
      continue;
    }
    const statusParsed = parseStatus(cell(cells, "Statut"));
    if (!statusParsed.value) {
      out.reject(S, row, nivol, statusParsed.warning ?? "Statut manquant.");
      continue;
    }
    const take = <T>(column: string, parsed: Parsed<T>) => out.take(S, row, nivol, column, parsed);
    const modifiedAt = take("Modifié le", parseDay(cell(cells, "Modifié le")));
    let leftAt = take("Date de départ", parseDay(cell(cells, "Date de départ")));
    if (statusParsed.value === "LEFT" && !leftAt) {
      leftAt = modifiedAt ?? ctx.today;
      out.warn(
        S,
        row,
        nivol,
        `Parti(e) sans date de départ : date de départ fixée au ${modifiedAt ? "« Modifié le »" : "jour de l'import"}.`,
      );
    }
    const desired = {
      nivol,
      firstName,
      lastName,
      email: normalizeEmailCell(cell(cells, "E-mail")),
      phone: take("Téléphone", parsePhoneCell(cell(cells, "Téléphone"))),
      status: statusParsed.value,
      entryDate: take("Date d'entrée", parseDay(cell(cells, "Date d'entrée"))),
      leftAt,
      isMember: take("Adhérent", parseYesNo(cell(cells, "Adhérent"))),
      aptitude: take("Aptitude (Pegass)", parseAptitude(cell(cells, "Aptitude (Pegass)"))),
      aptitudeDate: take("Date aptitude", parseDay(cell(cells, "Date aptitude"))),
      otherAasc: take("Autre AASC", parseYesNo(cell(cells, "Autre AASC"))),
      isTrainer: take("Formateur", parseYesNo(cell(cells, "Formateur"))),
      regularMinorSupervisor: take(
        "Encadrant régulier mineurs",
        parseYesNo(cell(cells, "Encadrant régulier mineurs")),
      ),
      notes: txt(cells, "Notes"),
      legacyDriveFolderId: txt(cells, "Dossier Drive"),
      legacyImport: true,
    } satisfies Prisma.PersonUncheckedCreateInput;
    const desiredSensitive: ImportedSensitive = {
      birthDate: take("Date de naissance", parseDay(cell(cells, "Date de naissance"))),
      b3CheckedAt: take("Date vérif. B3", parseDay(cell(cells, "Date vérif. B3"))),
      parentalAuthorization: take(
        "Autorisation parentale",
        parseYesNo(cell(cells, "Autorisation parentale")),
      ),
      parentalAuthorizationDate: take(
        "Date autorisation",
        parseDay(cell(cells, "Date autorisation")),
      ),
    };
    const legacy = {
      modifiedAt: modifiedAt?.toISOString().slice(0, 10) ?? null,
      modifiedBy: txt(cells, "Modifié par"),
    };

    const person = current.get(nivol);
    const outcome = await upsertPerson(
      db,
      audit,
      ctx,
      S,
      row,
      nivol,
      out,
      person,
      desired,
      desiredSensitive,
      sensitive,
      legacy,
    );
    if (outcome === null) {
      people.set(nivol, { id: person?.id ?? null, birthDate: desiredSensitive.birthDate });
      continue;
    }
    people.set(nivol, { id: outcome.id, birthDate: desiredSensitive.birthDate });
    out.done(S, outcome.outcome);
    if (outcome.outcome !== "unchanged") out.personCount += 1;
  }
}

type PersonRow = Prisma.PersonGetPayload<object>;

/**
 * Creates or updates a person and her sensitive values. Returns null on a
 * conflict (already reported), else the outcome and id (null in simulation
 * for a new person).
 */
async function upsertPerson(
  db: Tx,
  audit: AuditRecorder,
  ctx: ImportContext,
  sheet: SheetName,
  row: number,
  key: string,
  out: Collector,
  person: PersonRow | undefined,
  desired: Prisma.PersonUncheckedCreateInput & Record<string, unknown>,
  desiredSensitive: ImportedSensitive,
  sensitive: Map<string, ImportedSensitive & { id: string }>,
  legacy: Record<string, string | null>,
): Promise<{ outcome: Outcome; id: string | null } | null> {
  if (!person) {
    if (!ctx.apply) return { outcome: "created", id: null };
    const created = await db.person.create({
      data: { ...desired, createdById: ctx.actorUserId, updatedById: ctx.actorUserId },
    });
    audit.created("Person", created.id, { ...created, legacy }, { action: "IMPORT" });
    await writeSensitiveForImport(
      db,
      audit,
      ctx.actorUserId,
      created.id,
      desiredSensitive,
      undefined,
    );
    return { outcome: "created", id: created.id };
  }
  const currentSensitive = sensitive.get(person.id);
  const personDiff = changes("Person", pick(person, Object.keys(desired)), desired);
  const sensitiveDiff = changes(
    "PersonSensitive",
    currentSensitive
      ? { ...currentSensitive }
      : {
          birthDate: null,
          b3CheckedAt: null,
          parentalAuthorization: null,
          parentalAuthorizationDate: null,
        },
    desiredSensitive,
  );
  if (personDiff.length === 0 && sensitiveDiff.length === 0)
    return { outcome: "unchanged", id: person.id };
  const conflict =
    (personDiff.length > 0 && (await locallyModified(db, "Person", person.id))) ||
    (sensitiveDiff.length > 0 &&
      currentSensitive !== undefined &&
      (await locallyModified(db, "PersonSensitive", currentSensitive.id)));
  if (conflict) {
    out.conflict(sheet, row, key, [...personDiff, ...sensitiveDiff]);
    return null;
  }
  if (ctx.apply) {
    if (personDiff.length > 0) {
      const data = Object.fromEntries(personDiff.map((f) => [f, desired[f]]));
      const after = await db.person.update({
        where: { id: person.id },
        data: { ...data, updatedById: ctx.actorUserId },
      });
      audit.updated("Person", person.id, person, pick(after, personDiff), { action: "IMPORT" });
      audit.log({
        action: "IMPORT",
        entity: "Person",
        entityId: person.id,
        field: "legacy",
        newValue: legacy,
      });
    }
    if (sensitiveDiff.length > 0) {
      await writeSensitiveForImport(
        db,
        audit,
        ctx.actorUserId,
        person.id,
        desiredSensitive,
        currentSensitive,
      );
    }
  }
  return { outcome: "updated", id: person.id };
}

// ---------------------------------------------------------------------------
// Prospects → Person (CANDIDATE) + Candidacy (key: ID → Candidacy.legacyRef)
// ---------------------------------------------------------------------------

const CANDIDACY_FIELDS = [
  "stage",
  "source",
  "interest",
  "firstContactAt",
  "nextAction",
  "followUpAt",
  "closedAt",
];

async function importProspects(
  db: Tx,
  audit: AuditRecorder,
  rows: SheetRow[],
  out: Collector,
  ctx: ImportContext,
  people: Map<string, PersonRef>,
) {
  const S = "Prospects";
  const ids = rows.map((r) => txt(r.cells, "ID")).filter((v): v is string => v !== null);
  const candidacies = new Map(
    (
      await db.candidacy.findMany({ where: { legacyRef: { in: ids } }, include: { person: true } })
    ).map((c) => [c.legacyRef ?? "", c]),
  );
  const sensitive = await loadSensitiveForImport(
    db,
    [...candidacies.values()].map((c) => c.personId),
  );
  const seen = new Map<string, number>();

  for (const { row, cells } of rows) {
    const id = txt(cells, "ID");
    if (!id) {
      out.reject(S, row, null, "ID manquant.");
      continue;
    }
    const first = seen.get(id);
    if (first !== undefined) {
      out.reject(S, row, id, `ID en double : déjà présent ligne ${first}.`);
      continue;
    }
    seen.set(id, row);
    const take = <T>(column: string, parsed: Parsed<T>) => out.take(S, row, id, column, parsed);
    const firstName = txt(cells, "Prénom");
    const lastName = txt(cells, "Nom");
    if (!firstName || !lastName) {
      out.reject(S, row, id, "Prénom ou nom manquant.");
      continue;
    }
    const rawNivol = txt(cells, "NIVOL attribué");
    const nivol = normalizeNivol(rawNivol);
    if (rawNivol && !nivol)
      out.warn(S, row, id, `NIVOL attribué invalide « ${rawNivol} », ignoré.`);
    const linked = nivol ? people.get(nivol) : undefined;
    if (nivol && !linked)
      out.warn(
        S,
        row,
        id,
        `NIVOL attribué ${nivol} absent de l'onglet Benevoles : rattachement impossible.`,
      );

    const stageText = txt(cells, "Étape");
    const stageParsed = parseStage(cell(cells, "Étape"));
    if (stageText && !stageParsed.value)
      out.warn(S, row, id, `Étape inconnue « ${stageText} » : « Premier contact » retenu.`);
    const modifiedAt = take("Modifié le", parseInstant(cell(cells, "Modifié le")));
    const savedAt = take("Saisi le", parseInstant(cell(cells, "Saisi le")));
    const firstContactDay = take(
      "Date de premier contact",
      parseDay(cell(cells, "Date de premier contact")),
    );
    const desired = {
      stage: linked ? ("DONE" as const) : (stageParsed.value ?? "FIRST_CONTACT"),
      source: txt(cells, "Source"),
      interest: txt(cells, "Intérêt"),
      firstContactAt: firstContactDay ? parisMidnight(firstContactDay) : null,
      nextAction: txt(cells, "Prochaine action"),
      followUpAt: take("Date de relance", parseDay(cell(cells, "Date de relance"))),
      closedAt: linked ? (modifiedAt ?? savedAt ?? ctx.now) : null,
    };
    const desiredPerson = {
      firstName,
      lastName,
      email: normalizeEmailCell(cell(cells, "E-mail")),
      phone: take("Téléphone", parsePhoneCell(cell(cells, "Téléphone"))),
      notes: txt(cells, "Notes"),
    };
    const desiredSensitive: ImportedSensitive = {
      birthDate: take("Date de naissance", parseDay(cell(cells, "Date de naissance"))),
    };
    const legacy = {
      savedAt: savedAt?.toISOString() ?? null,
      savedBy: txt(cells, "Saisi par"),
      modifiedAt: modifiedAt?.toISOString() ?? null,
      modifiedBy: txt(cells, "Modifié par"),
    };
    const existing = candidacies.get(id);

    if (!existing) {
      if (ctx.apply) {
        let personId = linked?.id ?? null;
        if (!personId) {
          const person = await db.person.create({
            data: {
              ...desiredPerson,
              status: "CANDIDATE",
              legacyImport: true,
              createdById: ctx.actorUserId,
              updatedById: ctx.actorUserId,
            },
          });
          audit.created("Person", person.id, { ...person, legacy }, { action: "IMPORT" });
          await writeSensitiveForImport(
            db,
            audit,
            ctx.actorUserId,
            person.id,
            desiredSensitive,
            undefined,
          );
          personId = person.id;
        }
        const candidacy = await db.candidacy.create({
          data: {
            ...desired,
            personId,
            legacyRef: id,
            createdAt: savedAt ?? ctx.now,
            createdById: ctx.actorUserId,
            updatedById: ctx.actorUserId,
          },
        });
        audit.created("Candidacy", candidacy.id, { ...candidacy, legacy }, { action: "IMPORT" });
      }
      if (!linked) out.personCount += 1;
      out.done(S, "created");
      continue;
    }

    const candidacyDiff = changes("Candidacy", pick(existing, CANDIDACY_FIELDS), desired);
    // The person of a linked prospect comes from Benevoles: never overwritten from here.
    const ownPerson = existing.person.nivol === null;
    const personDiff = ownPerson
      ? changes("Person", pick(existing.person, Object.keys(desiredPerson)), desiredPerson)
      : [];
    const currentSensitive = sensitive.get(existing.personId);
    const sensitiveDiff = ownPerson
      ? changes(
          "PersonSensitive",
          currentSensitive ? { ...currentSensitive } : { birthDate: null },
          desiredSensitive,
        )
      : [];
    if (candidacyDiff.length + personDiff.length + sensitiveDiff.length === 0) {
      out.done(S, "unchanged");
      continue;
    }
    const conflict =
      (candidacyDiff.length > 0 && (await locallyModified(db, "Candidacy", existing.id))) ||
      (personDiff.length > 0 && (await locallyModified(db, "Person", existing.personId)));
    if (conflict) {
      out.conflict(S, row, id, [...candidacyDiff, ...personDiff, ...sensitiveDiff]);
      continue;
    }
    if (ctx.apply) {
      if (candidacyDiff.length > 0) {
        const data = Object.fromEntries(
          candidacyDiff.map((f) => [f, desired[f as keyof typeof desired]]),
        );
        await db.candidacy.update({
          where: { id: existing.id },
          data: { ...data, updatedById: ctx.actorUserId },
        });
        audit.updated("Candidacy", existing.id, existing, data, { action: "IMPORT" });
      }
      if (personDiff.length > 0) {
        const data = Object.fromEntries(
          personDiff.map((f) => [f, desiredPerson[f as keyof typeof desiredPerson]]),
        );
        await db.person.update({
          where: { id: existing.personId },
          data: { ...data, updatedById: ctx.actorUserId },
        });
        audit.updated("Person", existing.personId, existing.person, data, { action: "IMPORT" });
      }
      if (sensitiveDiff.length > 0) {
        await writeSensitiveForImport(
          db,
          audit,
          ctx.actorUserId,
          existing.personId,
          desiredSensitive,
          currentSensitive,
        );
      }
    }
    if (personDiff.length + sensitiveDiff.length > 0) out.personCount += 1;
    out.done(S, "updated");
  }
}

// ---------------------------------------------------------------------------
// Sessions → TrainingRecord (key: ID → legacyRef)
// ---------------------------------------------------------------------------

const RECORD_FIELDS = [
  "personId",
  "referenceId",
  "date",
  "result",
  "place",
  "pegassUrl",
  "comment",
  "expiresAt",
];

async function importTrainings(
  db: Tx,
  audit: AuditRecorder,
  rows: SheetRow[],
  out: Collector,
  ctx: ImportContext,
  people: Map<string, PersonRef>,
) {
  const S = "Sessions";
  const references = new Map((await db.referenceItem.findMany()).map((r) => [r.code, r]));
  const ids = rows.map((r) => txt(r.cells, "ID")).filter((v): v is string => v !== null);
  const records = new Map(
    (await db.trainingRecord.findMany({ where: { legacyRef: { in: ids } } })).map((r) => [
      r.legacyRef ?? "",
      r,
    ]),
  );
  const seen = new Map<string, number>();

  for (const { row, cells } of rows) {
    const id = txt(cells, "ID");
    if (!id) {
      out.reject(S, row, null, "ID manquant.");
      continue;
    }
    const first = seen.get(id);
    if (first !== undefined) {
      out.reject(S, row, id, `ID en double : déjà présent ligne ${first}.`);
      continue;
    }
    seen.set(id, row);
    const rawNivol = txt(cells, "NIVOL");
    const nivol = normalizeNivol(rawNivol);
    if (!nivol) {
      out.reject(S, row, id, rawNivol ? `NIVOL invalide « ${rawNivol} ».` : "NIVOL manquant.");
      continue;
    }
    const person = people.get(nivol);
    if (!person) {
      out.reject(
        S,
        row,
        id,
        `NIVOL inconnu ${nivol} (absent de l'onglet Benevoles et de Binivol).`,
      );
      continue;
    }
    const code = txt(cells, "Code")?.toUpperCase() ?? null;
    const reference = code ? references.get(code) : undefined;
    if (!reference) {
      out.reject(
        S,
        row,
        id,
        code ? `Code inconnu « ${code} » (absent du référentiel).` : "Code manquant.",
      );
      continue;
    }
    if (reference.kind === "FUNCTION") {
      out.reject(
        S,
        row,
        id,
        `Le code ${code ?? ""} est une fonction : à saisir dans l'onglet Fonctions.`,
      );
      continue;
    }
    const take = <T>(column: string, parsed: Parsed<T>) => out.take(S, row, id, column, parsed);
    const date = take("Date", parseDay(cell(cells, "Date")));
    const resultText = txt(cells, "Résultat");
    const resultParsed = parseResult(cell(cells, "Résultat"));
    if (resultText && !resultParsed.value)
      out.warn(S, row, id, `Résultat inconnu « ${resultText} » : « À confirmer » retenu.`);
    const result = resultParsed.value ?? "TO_CONFIRM";
    const savedAt = take("Saisi le", parseInstant(cell(cells, "Saisi le")));
    const desired = {
      personId: person.id ?? `pending:${nivol}`,
      referenceId: reference.id,
      date,
      result,
      place: txt(cells, "Organisme / lieu"),
      pegassUrl: txt(cells, "Lien Pegass"),
      comment: txt(cells, "Commentaire"),
      expiresAt:
        result === "PASSED"
          ? computeExpiresAt(
              {
                validityMonths: reference.validityMonths,
                expiresEndOfYear: reference.expiresEndOfYear,
              },
              date,
            )
          : null,
    };
    const legacy = { savedAt: savedAt?.toISOString() ?? null, savedBy: txt(cells, "Saisi par") };
    const existing = records.get(id);
    if (!existing) {
      if (ctx.apply && person.id) {
        const created = await db.trainingRecord.create({
          data: {
            ...desired,
            personId: person.id,
            legacyRef: id,
            createdAt: savedAt ?? ctx.now,
            createdById: ctx.actorUserId,
            updatedById: ctx.actorUserId,
          },
        });
        audit.created("TrainingRecord", created.id, { ...created, legacy }, { action: "IMPORT" });
      }
      out.done(S, "created");
      continue;
    }
    const diff = changes("TrainingRecord", pick(existing, RECORD_FIELDS), desired);
    if (diff.length === 0) {
      out.done(S, "unchanged");
      continue;
    }
    if (await locallyModified(db, "TrainingRecord", existing.id)) {
      out.conflict(S, row, id, diff);
      continue;
    }
    if (ctx.apply) {
      const data = Object.fromEntries(diff.map((f) => [f, desired[f as keyof typeof desired]]));
      await db.trainingRecord.update({
        where: { id: existing.id },
        data: { ...data, updatedById: ctx.actorUserId },
      });
      audit.updated("TrainingRecord", existing.id, existing, data, { action: "IMPORT" });
    }
    out.done(S, "updated");
  }
}

// ---------------------------------------------------------------------------
// Fonctions → Appointment (key: ID → legacyRef)
// ---------------------------------------------------------------------------

const APPOINTMENT_FIELDS = [
  "personId",
  "referenceId",
  "startDate",
  "endDate",
  "authorizedBy",
  "decisionRef",
  "comment",
  "cancelledAt",
  "cancelledById",
  "cancelReason",
];

function ageOn(birthDate: Date, day: Date): number {
  let age = day.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    day.getUTCMonth() < birthDate.getUTCMonth() ||
    (day.getUTCMonth() === birthDate.getUTCMonth() && day.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

async function importAppointments(
  db: Tx,
  audit: AuditRecorder,
  rows: SheetRow[],
  out: Collector,
  ctx: ImportContext,
  people: Map<string, PersonRef>,
) {
  const S = "Fonctions";
  const references = new Map((await db.referenceItem.findMany()).map((r) => [r.code, r]));
  const users = new Map(
    (await db.user.findMany({ select: { id: true, email: true } })).map((u) => [u.email, u.id]),
  );
  const ids = rows.map((r) => txt(r.cells, "ID")).filter((v): v is string => v !== null);
  const appointments = new Map(
    (await db.appointment.findMany({ where: { legacyRef: { in: ids } } })).map((a) => [
      a.legacyRef ?? "",
      a,
    ]),
  );
  const sensitiveBirth = await loadSensitiveForImport(
    db,
    [...people.values()].map((p) => p.id).filter((v): v is string => v !== null),
  );
  const seen = new Map<string, number>();

  for (const { row, cells } of rows) {
    const id = txt(cells, "ID");
    if (!id) {
      out.reject(S, row, null, "ID manquant.");
      continue;
    }
    const first = seen.get(id);
    if (first !== undefined) {
      out.reject(S, row, id, `ID en double : déjà présent ligne ${first}.`);
      continue;
    }
    seen.set(id, row);
    const rawNivol = txt(cells, "NIVOL");
    const nivol = normalizeNivol(rawNivol);
    if (!nivol) {
      out.reject(S, row, id, rawNivol ? `NIVOL invalide « ${rawNivol} ».` : "NIVOL manquant.");
      continue;
    }
    const person = people.get(nivol);
    if (!person) {
      out.reject(
        S,
        row,
        id,
        `NIVOL inconnu ${nivol} (absent de l'onglet Benevoles et de Binivol).`,
      );
      continue;
    }
    const code = txt(cells, "Fonction")?.toUpperCase() ?? null;
    const reference = code ? references.get(code) : undefined;
    if (!reference) {
      out.reject(
        S,
        row,
        id,
        code ? `Fonction inconnue « ${code} » (absente du référentiel).` : "Fonction manquante.",
      );
      continue;
    }
    if (reference.kind !== "FUNCTION") {
      out.reject(S, row, id, `Le code ${code ?? ""} est une formation, pas une fonction.`);
      continue;
    }
    const take = <T>(column: string, parsed: Parsed<T>) => out.take(S, row, id, column, parsed);
    const startDate = take("Date de début", parseDay(cell(cells, "Date de début")));
    const cancellation = take("Annulée", parseCancellation(cell(cells, "Annulée"), ctx.today));
    let cancelledById: string | null = null;
    let cancelReason: string | null = null;
    if (cancellation) {
      cancelledById = cancellation.email ? (users.get(cancellation.email) ?? null) : null;
      cancelReason =
        cancellation.email && !cancelledById
          ? `${cancellation.email} : ${cancellation.reason}`
          : cancellation.reason;
    }
    const birthDate =
      person.birthDate ?? (person.id ? (sensitiveBirth.get(person.id)?.birthDate ?? null) : null);
    if (
      reference.forbiddenForMinors &&
      birthDate &&
      ageOn(birthDate, startDate ?? ctx.today) < 18
    ) {
      out.warn(
        S,
        row,
        id,
        `Nomination d'un mineur à ${reference.code}, fonction interdite aux mineurs : historique repris tel quel, à vérifier.`,
      );
    }
    const savedAt = take("Saisi le", parseInstant(cell(cells, "Saisi le")));
    const desired = {
      personId: person.id ?? `pending:${nivol}`,
      referenceId: reference.id,
      startDate,
      endDate: take("Date de fin", parseDay(cell(cells, "Date de fin"))),
      authorizedBy: txt(cells, "Autorisée par"),
      decisionRef: txt(cells, "Référence décision"),
      comment: txt(cells, "Commentaire"),
      cancelledAt: cancellation?.at ?? null,
      cancelledById,
      cancelReason,
    };
    const legacy = { savedAt: savedAt?.toISOString() ?? null, savedBy: txt(cells, "Saisi par") };
    const existing = appointments.get(id);
    if (!existing) {
      if (ctx.apply && person.id) {
        const created = await db.appointment.create({
          data: {
            ...desired,
            personId: person.id,
            legacyRef: id,
            createdAt: savedAt ?? ctx.now,
            createdById: ctx.actorUserId,
            updatedById: ctx.actorUserId,
          },
        });
        audit.created("Appointment", created.id, { ...created, legacy }, { action: "IMPORT" });
      }
      out.done(S, "created");
      continue;
    }
    const diff = changes("Appointment", pick(existing, APPOINTMENT_FIELDS), desired);
    if (diff.length === 0) {
      out.done(S, "unchanged");
      continue;
    }
    if (await locallyModified(db, "Appointment", existing.id)) {
      out.conflict(S, row, id, diff);
      continue;
    }
    if (ctx.apply) {
      const data = Object.fromEntries(diff.map((f) => [f, desired[f as keyof typeof desired]]));
      await db.appointment.update({
        where: { id: existing.id },
        data: { ...data, updatedById: ctx.actorUserId },
      });
      audit.updated("Appointment", existing.id, existing, data, { action: "IMPORT" });
    }
    out.done(S, "updated");
  }
}

// ---------------------------------------------------------------------------
// Journal → AuditLog (key: SHA-256 of the masked row → legacyHash)
// ---------------------------------------------------------------------------

async function importJournal(db: Tx, rows: SheetRow[], out: Collector, ctx: ImportContext) {
  const S = "Journal";
  const prepared = rows.map(({ row, cells }) => {
    const at = parseInstant(cell(cells, "Horodatage"));
    const journal: JournalRow = {
      at: at.value?.toISOString() ?? txt(cells, "Horodatage"),
      user: txt(cells, "Utilisateur"),
      action: txt(cells, "Action"),
      table: txt(cells, "Table"),
      key: txt(cells, "Clé"),
      field: txt(cells, "Champ"),
      oldValue: journalValueText(cell(cells, "Ancienne valeur"), txt(cells, "Champ")),
      newValue: journalValueText(cell(cells, "Nouvelle valeur"), txt(cells, "Champ")),
    };
    return { row, at, journal, hash: journalHash(journal) };
  });
  const known = new Set(
    (
      await db.auditLog.findMany({
        where: { legacyHash: { in: prepared.map((p) => p.hash) } },
        select: { legacyHash: true },
      })
    ).map((a) => a.legacyHash),
  );
  for (const { row, at, journal, hash } of prepared) {
    if (at.warning || !at.value)
      out.warn(S, row, null, `Horodatage : ${at.warning ?? "absent"} Date de l'import retenue.`);
    if (known.has(hash)) {
      out.done(S, "unchanged");
      continue;
    }
    known.add(hash);
    const masked = maskJournalRow(journal);
    if (ctx.apply) {
      await db.auditLog.create({
        data: {
          at: at.value ?? ctx.now,
          actorId: null,
          actorLabel: masked.user ?? "Import",
          action: "IMPORT",
          legacyAction: masked.action,
          // System actions (« Sauvegarde »…) have no table nor key: entity stays null.
          entity: masked.table,
          entityId: masked.key,
          field: masked.field,
          oldValue: masked.oldValue ?? undefined,
          newValue: masked.newValue ?? undefined,
          legacyHash: hash,
        },
      });
    }
    out.done(S, "created");
  }
}
