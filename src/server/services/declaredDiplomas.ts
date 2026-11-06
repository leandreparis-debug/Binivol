import { DIPLOMA_ISSUER_LABELS } from "@/lib/diplomas";
import { toParisDay } from "@/lib/dates";
import type { Db, DbOrTx } from "../db";
import { DomainError } from "../errors";
import { authorize } from "../policy/can";
import { loadPersonFacts } from "../policy/facts";
import type { Actor } from "../policy/types";
import { dossierSettings } from "../settings";
import { recordTrainingGroup } from "./trainings";

/**
 * Declared diplomas of a person (online dossier, step 16) that match an item
 * of the reference list: Binivol **proposes** to open the qualification « à
 * vérifier dans Pegass » (result TO_CONFIRM), never on its own. No copy of a
 * diploma is ever asked (ADR-049).
 */
export interface DiplomaProposal {
  diplomaId: string;
  label: string;
  year: number | null;
  issuer: string | null;
  reference: { id: string; code: string; label: string };
  /** A record of this training already exists (any result): nothing to open. */
  alreadyRecorded: boolean;
}

export async function diplomaProposals(
  db: DbOrTx,
  actor: Actor,
  personId: string,
): Promise<DiplomaProposal[]> {
  const facts = await loadPersonFacts(db, personId);
  if (!facts) throw new DomainError("NOT_FOUND", "Personne introuvable.");
  authorize(actor, "training.read", { person: facts });
  const [diplomas, { diplomaCatalog }] = await Promise.all([
    db.personDeclaredDiploma.findMany({
      where: { personId, code: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, code: true, year: true, issuer: true },
    }),
    dossierSettings(db),
  ]);
  const referenceOf = new Map(
    diplomaCatalog.flatMap((c) => (c.reference ? [[c.code, c.reference] as const] : [])),
  );
  const codes = [...new Set(diplomas.flatMap((d) => referenceOf.get(d.code ?? "") ?? []))];
  if (codes.length === 0) return [];
  const [references, records] = await Promise.all([
    db.referenceItem.findMany({
      where: { code: { in: codes }, kind: "TRAINING", active: true },
      select: { id: true, code: true, label: true },
    }),
    db.trainingRecord.findMany({
      where: { personId, cancelledAt: null, reference: { code: { in: codes } } },
      select: { reference: { select: { code: true } } },
    }),
  ]);
  const byCode = new Map(references.map((r) => [r.code, r]));
  const recorded = new Set(records.map((r) => r.reference.code));
  return diplomas.flatMap((d) => {
    const reference = byCode.get(referenceOf.get(d.code ?? "") ?? "");
    if (!reference) return [];
    return [
      {
        diplomaId: d.id,
        label: d.label,
        year: d.year,
        issuer: d.issuer ? DIPLOMA_ISSUER_LABELS[d.issuer] : null,
        reference,
        alreadyRecorded: recorded.has(reference.code),
      },
    ];
  });
}

/**
 * Opens the qualification « à vérifier dans Pegass » for one declared
 * diploma (`training.write` on the person): a TO_CONFIRM record, dated on
 * 1 January of the declared year when known. The usual warnings of a training
 * entry (prerequisites…) do not apply to a record to be checked: they are
 * accepted and kept in the audit.
 */
export async function openDeclaredQualification(
  db: Db,
  actor: Actor,
  input: { diplomaId: string },
): Promise<{ recordIds: string[] }> {
  const diploma = await db.personDeclaredDiploma.findUnique({
    where: { id: input.diplomaId },
    select: { personId: true },
  });
  if (!diploma) throw new DomainError("NOT_FOUND", "Diplôme introuvable.");
  const facts = await loadPersonFacts(db, diploma.personId);
  if (!facts) throw new DomainError("NOT_FOUND", "Personne introuvable.");
  authorize(actor, "training.write", { person: facts });
  const proposal = (await diplomaProposals(db, actor, diploma.personId)).find(
    (p) => p.diplomaId === input.diplomaId,
  );
  if (!proposal) {
    throw new DomainError(
      "INVALID_DATA",
      "Ce diplôme ne correspond à aucune formation du référentiel.",
    );
  }
  if (proposal.alreadyRecorded) {
    throw new DomainError("INVALID_DATA", "Cette formation figure déjà dans la fiche.");
  }
  const details = [proposal.year ? `obtenu en ${String(proposal.year)}` : null, proposal.issuer]
    .filter(Boolean)
    .join(", ");
  const entry = {
    referenceId: proposal.reference.id,
    date: proposal.year ? new Date(Date.UTC(proposal.year, 0, 1)) : null,
    result: "TO_CONFIRM" as const,
    personIds: [diploma.personId],
    comment: `Déclaré dans le dossier en ligne${details ? ` (${details})` : ""} : à vérifier dans Pegass.`,
  };
  const today = toParisDay();
  const first = await recordTrainingGroup(db, actor, entry, today);
  if (first.saved) return { recordIds: first.recordIds };
  const second = await recordTrainingGroup(
    db,
    actor,
    { ...entry, acceptedWarnings: first.warningsKey },
    today,
  );
  if (!second.saved)
    throw new DomainError("INVALID_DATA", "La qualification n'a pas pu être ouverte.");
  return { recordIds: second.recordIds };
}
