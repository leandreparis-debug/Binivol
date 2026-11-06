import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { todosForGdprExport } from "./todos";
import { formatDate, formatDateTime, toParisDay } from "@/lib/dates";
import {
  CANDIDACY_STAGE_LABELS,
  DOCUMENT_KIND_LABELS,
  FOLLOW_UP_KIND_LABELS,
  PERSON_STATUS_LABELS,
  TRAINING_RESULT_LABELS,
} from "@/lib/labels";
import type { DbOrTx } from "../db";
import { dossiersForGdprExport } from "../dossier/store";
import { DomainError } from "../errors";
import { authorize } from "../policy/can";
import { loadPersonFacts } from "../policy/facts";
import type { Actor } from "../policy/types";
import { listPersonDocuments, readDocument, readPersonSensitive } from "../sensitive";
import type { StorageService } from "../storage/types";
import { createZip, type ZipEntry } from "../zip";

/**
 * Export of all the data of a person (step 14, right of access and
 * portability, TOPAZE only): a ZIP with `donnees.json` (everything,
 * sensitive data included, structured and commented), `resume.pdf` (readable,
 * in French) and her stored documents. Every read is journaled (« export
 * RGPD »). Without a storage (demo), the archive lists the missing files.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Keeps what the standard PDF font can draw (Latin-1 and common French punctuation). */
function printable(text: string): string {
  return text.replace(/[^\u0000-ÿŒœ€‘’“”…–]/g, "?");
}

async function summaryPdf(title: string, sections: { heading: string; lines: string[] }[]) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(printable(title));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  let page: PDFPage = pdf.addPage([595, 842]);
  let y = 842 - margin;
  const write = (text: string, f: PDFFont, size: number) => {
    // Naive wrapping on spaces.
    const words = printable(text).split(" ");
    let line = "";
    const flush = () => {
      if (y < margin + size) {
        page = pdf.addPage([595, 842]);
        y = 842 - margin;
      }
      page.drawText(line, { x: margin, y, size, font: f });
      y -= size * 1.4;
      line = "";
    };
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) > 595 - 2 * margin && line) {
        flush();
        line = word;
      } else line = next;
    }
    flush();
  };
  write(title, bold, 16);
  y -= 6;
  for (const section of sections) {
    y -= 8;
    write(section.heading, bold, 12);
    if (section.lines.length === 0) write("Aucune donnée.", font, 10);
    for (const line of section.lines) write(line, font, 10);
  }
  return Buffer.from(await pdf.save());
}

export interface GdprExport {
  fileName: string;
  zip: Buffer;
  missingFiles: string[];
}

export async function gdprExport(
  db: DbOrTx,
  storage: StorageService | null,
  actor: Actor,
  personId: string,
  now: Date = new Date(),
): Promise<GdprExport> {
  const facts = await loadPersonFacts(db, personId);
  if (!facts) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  authorize(actor, "person.gdprExport", { person: facts });
  const person = await db.person.findUniqueOrThrow({
    where: { id: personId },
    include: {
      skills: true,
      languages: true,
      licenses: true,
      declaredDiplomas: true,
      wishedActivities: true,
      annexes: true,
      trainingRecords: { include: { reference: { select: { code: true, label: true } } } },
      trainingWishes: { include: { reference: { select: { code: true } } } },
      appointments: { include: { reference: { select: { code: true, label: true } } } },
      candidacies: { include: { events: true } },
      followUps: true,
      menteeships: {
        include: { mentor: { select: { firstName: true, lastName: true } } },
      },
      mentorships: {
        include: { mentee: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  const sensitive = await readPersonSensitive(db, actor, personId, "export RGPD");
  const dossiers = await dossiersForGdprExport(db, actor, personId);
  const todos = await todosForGdprExport(db, personId);
  const documents = await listPersonDocuments(db, actor, personId, facts);

  const files: ZipEntry[] = [];
  const missingFiles: string[] = [];
  for (const doc of documents) {
    const view = await readDocument(db, actor, doc.id, "export RGPD");
    const path = `documents/${view.fileName}`;
    try {
      if (!storage || view.fileMissing) throw new Error("absent");
      files.push({ name: path, data: await storage.get(view.storageKey) });
    } catch {
      missingFiles.push(path);
    }
  }

  const name = `${person.firstName} ${person.lastName}`;
  const data = {
    _lisez_moi:
      "Export de toutes les données de cette personne dans Binivol (droit d'accès et portabilité, RGPD). Dates au format AAAA-MM-JJ. Les documents sont dans le dossier « documents ».",
    exporte_le: now.toISOString(),
    exporte_par: actor.name,
    personne: {
      _commentaire: "Identité, coordonnées et situation dans l'unité locale.",
      reference: person.ref,
      nivol: person.nivol,
      civilite: person.civility,
      prenom: person.firstName,
      nom: person.lastName,
      nom_de_naissance: person.birthName,
      nom_d_usage: person.usageName,
      email: person.email,
      telephone: person.phone,
      email_professionnel: person.proEmail,
      telephone_professionnel: person.proPhone,
      email_croix_rouge: person.crfEmail,
      statut: PERSON_STATUS_LABELS[person.status],
      date_d_entree: iso(person.entryDate),
      date_de_depart: iso(person.leftAt),
      motif_de_depart: person.leftReason,
      commentaire_de_depart: person.leftComment,
      pause: {
        debut: iso(person.pausedAt),
        reprise_prevue: iso(person.pauseUntil),
        motif: person.pauseReason,
      },
      adherent: person.isMember,
      encadrant_regulier_de_mineurs: person.regularMinorSupervisor,
      formateur: person.isTrainer,
      profession: person.profession,
      secteur: person.sector,
      entreprise: person.company,
      notes: person.notes,
      refus_des_messages_d_anniversaire: person.greetingOptOut,
      purge_possible_a_partir_du: iso(person.purgeEligibleAt),
    },
    donnees_sensibles: {
      _commentaire:
        "Données sensibles : naissance, adresse, vérification du B3 (jamais de copie du casier), autorisation parentale, personnes à prévenir.",
      ...sensitive,
    },
    competences_declarees: {
      competences: person.skills.map((s) => ({ libelle: s.label, niveau: s.level })),
      langues: person.languages.map((l) => ({ langue: l.label, niveau: l.level })),
      permis: person.licenses.map((l) => l.category),
      diplomes: person.declaredDiplomas.map((d) => d.label),
      activites_souhaitees: person.wishedActivities.map((a) => a.label),
      annexes: person.annexes.map((a) => ({
        code: a.code,
        libelle: a.label,
        valide_jusqu_au: iso(a.validUntil),
      })),
    },
    formations: person.trainingRecords.map((r) => ({
      code: r.reference.code,
      libelle: r.reference.label,
      resultat: TRAINING_RESULT_LABELS[r.result],
      date: iso(r.date),
      echeance: iso(r.expiresAt),
      lieu: r.place,
      annulee: r.cancelledAt !== null,
    })),
    souhaits_de_formation: person.trainingWishes.map((w) => ({
      code: w.reference.code,
      etat: w.status,
    })),
    nominations: person.appointments.map((a) => ({
      code: a.reference.code,
      libelle: a.reference.label,
      debut: iso(a.startDate),
      fin: iso(a.endDate),
      annulee: a.cancelledAt !== null,
    })),
    candidatures: person.candidacies.map((c) => ({
      etape: CANDIDACY_STAGE_LABELS[c.stage],
      creee_le: iso(c.createdAt),
      close_le: iso(c.closedAt),
      origine: c.source,
      notes: c.notes,
      historique: c.events.map((e) => ({ le: e.at.toISOString(), vers: e.toStage, note: e.note })),
    })),
    points_de_suivi: person.followUps.map((f) => ({
      type: FOLLOW_UP_KIND_LABELS[f.kind],
      prevu_le: iso(f.scheduledAt),
      fait_le: iso(f.doneAt),
      compte_rendu: f.summary,
    })),
    parrainages: [
      ...person.menteeships.map((m) => ({
        role: "filleul",
        avec: `${m.mentor.firstName} ${m.mentor.lastName}`,
        debut: iso(m.startDate),
        fin: iso(m.endDate),
      })),
      ...person.mentorships.map((m) => ({
        role: "parrain",
        avec: `${m.mentee.firstName} ${m.mentee.lastName}`,
        debut: iso(m.startDate),
        fin: iso(m.endDate),
      })),
    ],
    taches_liees: todos,
    dossiers_en_ligne: dossiers.map((d) => ({
      statut: d.status,
      envoye_le: d.submittedAt?.toISOString() ?? null,
      signe_le: d.signedAt?.toISOString() ?? null,
      termine_le: d.completedAt?.toISOString() ?? null,
      saisie: d.data,
      pieces_jointes: d.attachments.map((a) => ({ type: a.kind, fichier: a.fileName })),
      signatures: d.signatures.map((s) => ({
        role: s.signerRole,
        nom: s.signerName,
        methode: s.method,
        le: s.signedAt.toISOString(),
      })),
    })),
    documents: documents.map((d) => ({
      type: DOCUMENT_KIND_LABELS[d.kind],
      fichier: `documents/${d.fileName}`,
      depose_le: iso(d.createdAt),
      archive: d.archivedAt !== null,
    })),
    fichiers_absents: missingFiles,
  };

  const pdf = await summaryPdf(`Données personnelles de ${name} (${person.ref})`, [
    {
      heading: "Export",
      lines: [
        `Exporté le ${formatDateTime(now)} par ${actor.name}.`,
        "Le fichier donnees.json contient l'ensemble des données, ce résumé les principales.",
      ],
    },
    {
      heading: "Identité et coordonnées",
      lines: [
        `Nom : ${name}`,
        `NIVOL : ${person.nivol ?? "aucun"}`,
        `E-mail : ${person.email ?? "non renseigné"} ; téléphone : ${person.phone ?? "non renseigné"}`,
        `Statut : ${PERSON_STATUS_LABELS[person.status]}${person.entryDate ? `, entrée le ${formatDate(person.entryDate)}` : ""}`,
      ],
    },
    {
      heading: "Données sensibles",
      lines: [
        `Naissance : ${sensitive.birthDate ? formatDate(sensitive.birthDate) : "non renseignée"}${sensitive.birthCity ? ` à ${sensitive.birthCity}` : ""}`,
        `Adresse : ${[sensitive.street, sensitive.postalCode, sensitive.city].filter(Boolean).join(" ") || "non renseignée"}`,
        `B3 : ${sensitive.b3CheckedAt ? `vérifié le ${formatDate(sensitive.b3CheckedAt)}` : "aucune vérification"}`,
        `Personnes à prévenir : ${String(sensitive.emergencyContacts.length)}`,
      ],
    },
    {
      heading: "Formations",
      lines: person.trainingRecords.map(
        (r) =>
          `${r.reference.code} : ${TRAINING_RESULT_LABELS[r.result]}${r.date ? ` le ${formatDate(r.date)}` : ""}${r.expiresAt ? `, échéance ${formatDate(r.expiresAt)}` : ""}`,
      ),
    },
    {
      heading: "Nominations",
      lines: person.appointments.map(
        (a) =>
          `${a.reference.code}${a.startDate ? ` depuis le ${formatDate(a.startDate)}` : ""}${a.endDate ? `, fin le ${formatDate(a.endDate)}` : ""}`,
      ),
    },
    {
      heading: "Candidatures et suivi",
      lines: [
        ...person.candidacies.map((c) => `Candidature : ${CANDIDACY_STAGE_LABELS[c.stage]}`),
        ...person.followUps.map(
          (f) =>
            `${FOLLOW_UP_KIND_LABELS[f.kind]} : ${f.doneAt ? `fait le ${formatDate(f.doneAt)}` : "prévu"}`,
        ),
      ],
    },
    {
      heading: "Documents",
      lines: [
        ...documents.map((d) => `${DOCUMENT_KIND_LABELS[d.kind]} : ${d.fileName}`),
        ...(missingFiles.length > 0
          ? [`Fichiers absents du stockage : ${String(missingFiles.length)}`]
          : []),
      ],
    },
  ]);

  await db.accessLog.create({
    data: { userId: actor.userId, personId, scope: "EXPORT", context: "export RGPD" },
  });
  const day = iso(toParisDay(now)) ?? "";
  return {
    fileName: `binivol-rgpd-${person.ref}-${day}.zip`,
    zip: createZip([
      { name: "donnees.json", data: Buffer.from(JSON.stringify(data, null, 2), "utf8") },
      { name: "resume.pdf", data: pdf },
      ...files,
    ]),
    missingFiles,
  };
}

/** Same, by the readable reference (route `/api/rgpd/[ref]`). */
export async function gdprExportByRef(
  db: DbOrTx,
  storage: StorageService | null,
  actor: Actor,
  ref: string,
): Promise<GdprExport> {
  const person = await db.person.findUnique({ where: { ref }, select: { id: true } });
  if (!person) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  return gdprExport(db, storage, actor, person.id);
}
