import {
  CANDIDACY_STAGE_LABELS,
  DOCUMENT_KIND_LABELS,
  FOLLOW_UP_KIND_LABELS,
  LEFT_REASON_LABELS,
  PERSON_STATUS_LABELS,
  TRAINING_RESULT_LABELS,
} from "@/lib/labels";
import { sortTimeline, type TimelineEvent } from "@/lib/timeline";
import type { PersonStatus } from "@/generated/prisma/enums";
import type { DbOrTx } from "./db";
import { authorize, can } from "./policy/can";
import type { Actor, PersonFacts } from "./policy/types";
import type { PolicyAction } from "@/lib/actions";
import { listPersonDocuments } from "./sensitive";

/**
 * Timeline of a person: every dated event of her life in Binivol, merged and
 * sorted from the most recent (events without a date last).
 *
 * Each kind of event appears only when the actor holds the matching right:
 *
 * | Events                                   | Right               |
 * | ---------------------------------------- | ------------------- |
 * | entry, departure, status changes, import | `person.full.read`  |
 * | candidacy stages                         | `candidacy.manage`  |
 * | trainings                                | `training.read`     |
 * | appointments (start, end, cancellation)  | `appointment.read`  |
 * | follow-ups                               | `followUp.manage`   |
 * | mentorships                              | `mentorship.manage` |
 * | documents                                | `document.read`     |
 *
 * Status changes come from the audit trail (`audit_logs`, field `status`).
 *
 * @throws {ForbiddenError} without `person.full.read`.
 */
export async function timelineOf(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
): Promise<TimelineEvent[]> {
  authorize(actor, "person.full.read", { person: facts });
  const allowed = (action: PolicyAction) => can(actor, action, { person: facts }).allowed;
  const none = Promise.resolve([]);

  const [person, audit, candidacies, trainings, appointments, followUps, mentorships, documents] =
    await Promise.all([
      db.person.findUniqueOrThrow({
        where: { id: personId },
        select: { entryDate: true, leftAt: true, leftReason: true },
      }),
      db.auditLog.findMany({
        where: {
          entity: "Person",
          entityId: personId,
          OR: [
            { field: "status" },
            { action: "IMPORT", field: null },
            // Step 11: the reason of a return or a pause, and the B3 check (date only).
            { field: "statusReason" },
            { field: "b3Check" },
          ],
        },
        orderBy: { at: "asc" },
        select: { id: true, at: true, action: true, field: true, oldValue: true, newValue: true },
      }),
      allowed("candidacy.manage")
        ? db.candidacyEvent.findMany({
            where: { candidacy: { personId } },
            select: { id: true, at: true, fromStage: true, toStage: true, note: true },
          })
        : none,
      allowed("training.read")
        ? db.trainingRecord.findMany({
            where: { personId },
            select: {
              id: true,
              date: true,
              result: true,
              cancelledAt: true,
              reference: { select: { code: true, label: true } },
            },
          })
        : none,
      allowed("appointment.read")
        ? db.appointment.findMany({
            where: { personId },
            select: {
              id: true,
              startDate: true,
              endDate: true,
              cancelledAt: true,
              cancelReason: true,
              reference: { select: { code: true, label: true } },
            },
          })
        : none,
      allowed("followUp.manage")
        ? db.followUp.findMany({
            where: { personId },
            select: { id: true, kind: true, scheduledAt: true, doneAt: true },
          })
        : none,
      allowed("mentorship.manage")
        ? db.mentorship.findMany({
            where: { OR: [{ menteeId: personId }, { mentorId: personId }] },
            select: {
              id: true,
              menteeId: true,
              startDate: true,
              endDate: true,
              mentee: { select: { firstName: true, lastName: true } },
              mentor: { select: { firstName: true, lastName: true } },
            },
          })
        : none,
      allowed("document.read") ? listPersonDocuments(db, actor, personId, facts) : none,
    ]);

  const events: TimelineEvent[] = [];
  const push = (event: TimelineEvent) => events.push(event);

  if (person.entryDate) {
    push({ id: "entry", type: "entry", date: person.entryDate, title: "Entrée à l'unité locale" });
  }
  if (person.leftAt) {
    push({
      id: "left",
      type: "entry",
      date: person.leftAt,
      title: "Départ",
      detail: person.leftReason ? LEFT_REASON_LABELS[person.leftReason] : null,
    });
  }
  for (const entry of audit) {
    if (entry.field === "status") {
      const label = (value: unknown) =>
        typeof value === "string" && value in PERSON_STATUS_LABELS
          ? PERSON_STATUS_LABELS[value as PersonStatus]
          : "—";
      push({
        id: `status-${entry.id}`,
        type: "status",
        date: entry.at,
        title: `Statut : ${label(entry.oldValue)} → ${label(entry.newValue)}`,
        detail: entry.action === "IMPORT" ? "Mis à jour par l'import de l'ancien classeur" : null,
      });
    } else if (entry.field === "statusReason") {
      const value = entry.newValue as { kind?: string; reason?: string } | null;
      push({
        id: `reason-${entry.id}`,
        type: "status",
        date: entry.at,
        title:
          value?.kind === "return"
            ? "Retour d'un ancien bénévole"
            : "Motif du changement de statut",
        detail: value?.reason ?? null,
      });
    } else if (entry.field === "b3Check") {
      // Never the outcome: only that it was checked, and when.
      const value = entry.newValue as { checkedAt?: string } | null;
      push({
        id: `b3-${entry.id}`,
        type: "status",
        date: value?.checkedAt ? new Date(`${value.checkedAt}T00:00:00.000Z`) : entry.at,
        title: "B3 vérifié",
      });
    } else {
      push({
        id: `import-${entry.id}`,
        type: "import",
        date: entry.at,
        title: "Reprise depuis l'ancien classeur",
      });
    }
  }
  for (const c of candidacies) {
    push({
      id: `candidacy-${c.id}`,
      type: "candidacy",
      date: c.at,
      title: c.fromStage
        ? `Candidature : ${CANDIDACY_STAGE_LABELS[c.fromStage]} → ${CANDIDACY_STAGE_LABELS[c.toStage]}`
        : `Candidature : ${CANDIDACY_STAGE_LABELS[c.toStage]}`,
      detail: c.note,
    });
  }
  for (const t of trainings) {
    push({
      id: `training-${t.id}`,
      type: "training",
      date: t.date,
      title: `${t.reference.code} — ${TRAINING_RESULT_LABELS[t.result]}`,
      detail: t.cancelledAt ? `${t.reference.label} (annulée)` : t.reference.label,
    });
  }
  for (const a of appointments) {
    const name = `${a.reference.code} — ${a.reference.label}`;
    // An appointment without a start date (most legacy rows) is shown in « Date inconnue ».
    push({
      id: `appointment-${a.id}`,
      type: "appointment",
      date: a.startDate,
      title: `Nomination : ${name}`,
    });
    if (a.endDate) {
      push({
        id: `appointment-end-${a.id}`,
        type: "appointment",
        date: a.endDate,
        title: `Fin de fonction : ${name}`,
      });
    }
    if (a.cancelledAt) {
      push({
        id: `appointment-cancel-${a.id}`,
        type: "appointment",
        date: a.cancelledAt,
        title: `Nomination annulée : ${name}`,
        detail: a.cancelReason,
      });
    }
  }
  for (const f of followUps) {
    push({
      id: `followup-${f.id}`,
      type: "followUp",
      date: f.doneAt ?? f.scheduledAt,
      title: `${FOLLOW_UP_KIND_LABELS[f.kind]} — ${f.doneAt ? "fait" : "prévu"}`,
    });
  }
  for (const m of mentorships) {
    const mentee = m.menteeId === personId;
    const other = mentee ? m.mentor : m.mentee;
    const name = `${other.firstName} ${other.lastName}`;
    push({
      id: `mentorship-${m.id}`,
      type: "mentorship",
      date: m.startDate,
      title: mentee ? `Parrainage par ${name}` : `Parraine ${name}`,
    });
    if (m.endDate) {
      push({
        id: `mentorship-end-${m.id}`,
        type: "mentorship",
        date: m.endDate,
        title: `Fin du parrainage (${name})`,
      });
    }
  }
  for (const d of documents) {
    push({
      id: `document-${d.id}`,
      type: "document",
      date: d.createdAt,
      title: `Document déposé : ${DOCUMENT_KIND_LABELS[d.kind]}`,
      detail: d.archivedAt ? "Archivé" : null,
    });
  }
  return sortTimeline(events);
}
