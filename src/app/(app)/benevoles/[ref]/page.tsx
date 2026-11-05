import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { DeadlineBar } from "@/components/person/DeadlineBar";
import { DeadlineDot } from "@/components/person/DeadlineDot";
import { personDisplayName } from "@/components/person/PersonName";
import { TabNav, type TabLink } from "@/components/person/TabNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatAge, formatSeniority } from "@/lib/age";
import { getEnv } from "@/lib/env";
import { formatDate, toParisDay } from "@/lib/dates";
import { classifyDeadline } from "@/lib/deadlines";
import {
  APTITUDE_LABELS,
  FOLLOW_UP_KIND_LABELS,
  LANGUAGE_LEVEL_LABELS,
  LEFT_REASON_LABELS,
  PERIMETER_LABELS,
  REFERENCE_CATEGORY_LABELS,
  SKILL_LEVEL_LABELS,
  TRAINING_RESULT_LABELS,
  TRAINING_WISH_STATUS_LABELS,
} from "@/lib/labels";
import { formatPhone, phoneHref } from "@/lib/phone";
import { toVolunteerStatus } from "@/lib/status";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import type { Actor, PersonFacts } from "@/server/policy/types";
import { listPersonDocuments } from "@/server/sensitive";
import {
  lookupPerson,
  personAppointments,
  personFollowUp,
  personHeader,
  personReducedHeader,
  personOverview,
  personTrainings,
  type AppointmentLine,
  type PersonHeader,
  type ReducedHeader,
} from "@/server/services/personProfile";
import { timelineOf } from "@/server/timeline";
import { defaultFollowUp } from "@/server/candidacy/rules";
import { can } from "@/server/policy/can";
import { integrationTab } from "@/server/services/candidacies";
import { dossierBlock } from "@/server/services/dossiers";
import { DocumentsPanel } from "./DocumentsPanel";
import { DossierBlock } from "./DossierBlock";
import { IntegrationPanel } from "./IntegrationPanel";
import { ListEditor } from "./ListEditor";
import { PersonActions } from "./PersonActions";
import { SensitivePanel } from "./SensitivePanel";
import { TimelineView } from "./TimelineView";

export const metadata: Metadata = { title: "Fiche bénévole" };

type Params = Promise<{ ref: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = [
  { key: "apercu", label: "Aperçu" },
  { key: "integration", label: "Intégration" },
  { key: "formations", label: "Formations" },
  { key: "fonctions", label: "Fonctions" },
  { key: "suivi", label: "Suivi" },
  { key: "documents", label: "Documents" },
  { key: "historique", label: "Historique" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const UNKNOWN = <span className="text-muted">Non renseigné</span>;

function yesNo(value: boolean | null) {
  if (value === null) return UNKNOWN;
  return value ? "Oui" : "Non";
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="text-body text-ink">{empty ? UNKNOWN : children}</dd>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-mono">{children}</span>;
}

function allowedTabs(header: PersonHeader): TabKey[] {
  const p = header.permissions;
  return TABS.map((t) => t.key).filter((key) => {
    switch (key) {
      case "integration":
        return p.readCandidacy;
      case "formations":
        return p.readTrainings;
      case "fonctions":
        return p.readAppointments;
      case "suivi":
        return p.readFollowUp;
      case "documents":
        return p.readDocuments;
      default:
        return true;
    }
  });
}

/** Header of the reduced page (FORMAT): directory fields, perimeters, trainer. */
function ReducedPersonHeader({ header }: { header: ReducedHeader }) {
  const { person } = header;
  return (
    <header className="mb-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/benevoles"
          className="inline-flex min-h-11 w-max items-center gap-2 rounded-pill text-small text-ink-2 focus-ring hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Annuaire
        </Link>
        {getEnv().AUTH_DEMO_LOGIN && <FakeDataBanner />}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="text-title text-ink sm:text-display">{personDisplayName(person)}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-ink-2">
          <Mono>{person.ref}</Mono>
          <span aria-hidden="true">·</span>
          {person.nivol ? (
            <span>
              NIVOL <Mono>{person.nivol}</Mono>
            </span>
          ) : (
            <span className="text-muted">Sans NIVOL</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusDot status={toVolunteerStatus(person.status)} />
          {person.isTrainer === true && <Chip tone="ink">Formateur</Chip>}
          {header.perimeters.map((p) => (
            <Chip key={p}>{PERIMETER_LABELS[p]}</Chip>
          ))}
        </div>
        <p className="text-small text-muted">Fiche réduite aux formations (profil FORMAT).</p>
      </div>
    </header>
  );
}

function Header({ header, day }: { header: PersonHeader; day: Date }) {
  const { person } = header;
  const seniority = formatSeniority(person.entryDate, day);
  return (
    <header className="mb-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/benevoles"
          className="inline-flex min-h-11 w-max items-center gap-2 rounded-pill text-small text-ink-2 focus-ring hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Annuaire
        </Link>
        {getEnv().AUTH_DEMO_LOGIN && <FakeDataBanner />}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-title text-ink sm:text-display">{personDisplayName(person)}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-ink-2">
            <Mono>{person.ref}</Mono>
            <span aria-hidden="true">·</span>
            {person.nivol ? (
              <span>
                NIVOL <Mono>{person.nivol}</Mono>
              </span>
            ) : (
              <span className="text-muted">Sans NIVOL</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusDot status={toVolunteerStatus(person.status)} />
            {header.age !== null && <Chip>{formatAge(header.age)}</Chip>}
            {header.minor && <Chip tone="warn">Mineur</Chip>}
            {person.isTrainer === true && <Chip tone="ink">Formateur</Chip>}
            {header.perimeters.map((p) => (
              <Chip key={p}>{PERIMETER_LABELS[p]}</Chip>
            ))}
            {person.archivedAt && <Chip tone="danger">Archivée</Chip>}
          </div>
          <p className="text-small text-ink-2">
            {person.entryDate ? (
              <>
                Entrée le <Mono>{formatDate(person.entryDate)}</Mono>
                {seniority && ` · ${seniority} d'ancienneté`}
              </>
            ) : (
              <span className="text-muted">Date d&apos;entrée non renseignée</span>
            )}
            {person.leftAt && (
              <>
                {" · "}Départ le <Mono>{formatDate(person.leftAt)}</Mono>
                {person.leftReason && ` (${LEFT_REASON_LABELS[person.leftReason]})`}
              </>
            )}
          </p>
        </div>
        <PersonActions
          personId={person.id}
          status={person.status}
          nivol={person.nivol}
          legacyImport={header.legacyImport}
          identity={{
            civility: person.civility,
            firstName: person.firstName,
            lastName: person.lastName,
            birthName: person.birthName,
            usageName: person.usageName,
            email: person.email,
            phone: person.phone,
            proEmail: person.proEmail,
            proPhone: person.proPhone,
            profession: person.profession,
            sector: person.sector,
            company: person.company,
            notes: person.notes,
          }}
          can={{
            update: header.permissions.update,
            changeStatus: header.permissions.changeStatus,
            correctNivol: header.permissions.correctNivol,
          }}
        />
      </div>
    </header>
  );
}

async function OverviewTab({
  actor,
  header,
  facts,
  day,
}: {
  actor: Actor;
  header: PersonHeader;
  facts: PersonFacts;
  day: Date;
}) {
  const { person } = header;
  const overview = await personOverview(getDb(), actor, person.id, facts, header.alertDays, day);
  const editable = header.permissions.update;
  const phone = (value: string | null) =>
    value ? (
      <a href={phoneHref(value)} className="font-mono text-mono hover:underline">
        {formatPhone(value)}
      </a>
    ) : null;
  const mail = (value: string | null) =>
    value ? (
      <a href={`mailto:${value}`} className="break-all hover:underline">
        {value}
      </a>
    ) : null;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Contact</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Info label="E-mail">{mail(person.email)}</Info>
            <Info label="Téléphone">{phone(person.phone)}</Info>
            <Info label="E-mail Croix-Rouge">{mail(person.crfEmail)}</Info>
            <Info label="E-mail professionnel">{mail(person.proEmail)}</Info>
            <Info label="Téléphone professionnel">{phone(person.proPhone)}</Info>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Engagement</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Info label="Adhérent">{yesNo(person.isMember)}</Info>
            <Info label="Aptitude">
              {person.aptitude ? (
                <>
                  {APTITUDE_LABELS[person.aptitude]}
                  {person.aptitudeDate && (
                    <>
                      {" "}
                      le <Mono>{formatDate(person.aptitudeDate)}</Mono>
                    </>
                  )}
                </>
              ) : null}
            </Info>
            <Info label="Autre AASC">{yesNo(person.otherAasc)}</Info>
            <Info label="Encadrant régulier de mineurs">
              {yesNo(person.regularMinorSupervisor)}
            </Info>
            <Info label="Formateur">{yesNo(person.isTrainer)}</Info>
            <Info label="Profession">
              {[person.profession, person.sector, person.company].filter(Boolean).join(" · ") ||
                null}
            </Info>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Compétences annexes</CardTitle>
        </CardHeader>
        <CardContent>
          <ListEditor
            kind="annex"
            personId={person.id}
            editable={editable}
            entries={overview.annexes.map((a) => ({
              id: a.id,
              title: a.code,
              detail: a.label,
              values: {
                code: a.code,
                label: a.label ?? "",
                validUntil: a.validUntil?.toISOString().slice(0, 10) ?? "",
              },
              deadline: { value: a.deadline, date: a.validUntil },
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Compétences, langues et permis</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <section aria-label="Compétences" className="flex flex-col gap-1">
            <h3 className="text-small font-medium text-muted">Compétences</h3>
            <ListEditor
              kind="skill"
              personId={person.id}
              editable={editable}
              entries={overview.skills.map((s) => ({
                id: s.id,
                title: s.label,
                detail: SKILL_LEVEL_LABELS[s.level],
                values: { label: s.label, level: s.level },
              }))}
            />
          </section>
          <section aria-label="Langues" className="flex flex-col gap-1">
            <h3 className="text-small font-medium text-muted">Langues</h3>
            <ListEditor
              kind="language"
              personId={person.id}
              editable={editable}
              entries={overview.languages.map((l) => ({
                id: l.id,
                title: l.label,
                detail: LANGUAGE_LEVEL_LABELS[l.level],
                values: { label: l.label, level: l.level },
              }))}
            />
          </section>
          <section aria-label="Permis" className="flex flex-col gap-1">
            <h3 className="text-small font-medium text-muted">Permis de conduire</h3>
            <ListEditor
              kind="license"
              personId={person.id}
              editable={editable}
              entries={overview.licenses.map((l) => ({
                id: l.id,
                title: l.category,
                values: { category: l.category },
              }))}
            />
          </section>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle as="h2">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {person.notes ? (
            <p className="text-body whitespace-pre-line text-ink">{person.notes}</p>
          ) : (
            <p className="text-body text-muted">Aucune note.</p>
          )}
          {(overview.declaredDiplomas.length > 0 || overview.wishedActivities.length > 0) && (
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Info label="Diplômes déclarés">{overview.declaredDiplomas.join(", ") || null}</Info>
              <Info label="Activités souhaitées">
                {overview.wishedActivities.join(", ") || null}
              </Info>
            </dl>
          )}
        </CardContent>
      </Card>
      {header.permissions.readSensitive && (
        <div className="lg:col-span-2">
          <SensitivePanel personId={person.id} />
        </div>
      )}
    </div>
  );
}

async function TrainingsTab({
  actor,
  header,
  facts,
  day,
}: {
  actor: Actor;
  header: { person: { id: string }; alertDays: number };
  facts: PersonFacts;
  day: Date;
}) {
  const data = await personTrainings(
    getDb(),
    actor,
    header.person.id,
    facts,
    header.alertDays,
    day,
  );
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Qualifications détenues</CardTitle>
        </CardHeader>
        <CardContent>
          {data.qualifications.length === 0 ? (
            <p className="text-body text-muted">Aucune formation validée.</p>
          ) : (
            <DeadlineBar counts={data.counts} />
          )}
        </CardContent>
      </Card>
      {data.groups.length === 0 && <p className="text-body text-muted">Aucune formation suivie.</p>}
      {data.groups.map((group) => (
        <Card key={group.category}>
          <CardHeader>
            <CardTitle as="h2">{REFERENCE_CATEGORY_LABELS[group.category]}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-line">
              {group.lines.map((line) => (
                <li
                  key={line.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-body text-ink">
                      <Mono>{line.code}</Mono> — {line.label}
                    </span>
                    <span className="text-small text-ink-2">
                      {TRAINING_RESULT_LABELS[line.result]}
                      {line.cancelled && " · annulée"}
                      {" · "}
                      {line.date ? <Mono>{formatDate(line.date)}</Mono> : "date inconnue"}
                      {line.place && ` · ${line.place}`}
                    </span>
                  </span>
                  {line.deadline &&
                    (line.deadline === "none" && line.date ? (
                      <span className="text-small text-ink-2">Sans échéance</span>
                    ) : (
                      <DeadlineDot deadline={line.deadline} date={line.expiresAt} />
                    ))}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Souhaits de formation ouverts</CardTitle>
        </CardHeader>
        <CardContent>
          {data.wishes.length === 0 ? (
            <p className="text-body text-muted">Aucun souhait ouvert.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.wishes.map((w) => (
                <li key={w.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="text-body text-ink">
                    <Mono>{w.code}</Mono> — {w.label}
                  </span>
                  <span className="text-small text-ink-2">
                    {TRAINING_WISH_STATUS_LABELS[w.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AppointmentList({
  title,
  lines,
  empty,
}: {
  title: string;
  lines: AppointmentLine[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <p className="text-body text-muted">{empty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {lines.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-3">
                <span className="text-body text-ink">
                  <Mono>{a.code}</Mono> — {a.label}
                </span>
                <span className="text-small text-ink-2">
                  {a.startDate ? (
                    <>
                      Depuis le <Mono>{formatDate(a.startDate)}</Mono>
                    </>
                  ) : (
                    "Date de début inconnue"
                  )}
                  {a.endDate && (
                    <>
                      {" "}
                      · fin le <Mono>{formatDate(a.endDate)}</Mono>
                    </>
                  )}
                  {a.authorizedBy && ` · autorisée par ${a.authorizedBy}`}
                  {a.decisionRef && (
                    <>
                      {" "}
                      · <Mono>{a.decisionRef}</Mono>
                    </>
                  )}
                </span>
                {a.cancelledAt && (
                  <span className="text-small text-danger-ink">
                    Annulée le <Mono>{formatDate(a.cancelledAt)}</Mono>
                    {a.cancelReason && ` : ${a.cancelReason}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function AppointmentsTab({
  actor,
  header,
  facts,
  day,
}: {
  actor: Actor;
  header: PersonHeader;
  facts: PersonFacts;
  day: Date;
}) {
  const data = await personAppointments(getDb(), actor, header.person.id, facts, day);
  return (
    <div className="flex flex-col gap-6">
      <AppointmentList
        title="Fonctions actives"
        lines={data.active}
        empty="Aucune fonction active."
      />
      <AppointmentList
        title="Fonctions passées"
        lines={data.past}
        empty="Aucune fonction passée."
      />
      <AppointmentList
        title="Nominations annulées"
        lines={data.cancelled}
        empty="Aucune nomination annulée."
      />
    </div>
  );
}

async function FollowUpTab({
  actor,
  header,
  facts,
}: {
  actor: Actor;
  header: PersonHeader;
  facts: PersonFacts;
}) {
  const data = await personFollowUp(getDb(), actor, header.person.id, facts);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Points de suivi</CardTitle>
        </CardHeader>
        <CardContent>
          {data.followUps.length === 0 ? (
            <p className="text-body text-muted">Aucun point de suivi.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.followUps.map((f) => (
                <li key={f.id} className="flex flex-col gap-0.5 py-3">
                  <span className="text-body text-ink">{FOLLOW_UP_KIND_LABELS[f.kind]}</span>
                  <span className="text-small text-ink-2">
                    {f.doneAt ? (
                      <>
                        Fait le <Mono>{formatDate(f.doneAt)}</Mono>
                      </>
                    ) : f.scheduledAt ? (
                      <>
                        Prévu le <Mono>{formatDate(f.scheduledAt)}</Mono>
                      </>
                    ) : (
                      "Date non fixée"
                    )}
                    {f.conductedBy && ` · par ${f.conductedBy}`}
                  </span>
                  {f.summary && <span className="text-small text-ink">{f.summary}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Parrainages</CardTitle>
        </CardHeader>
        <CardContent>
          {data.mentorships.length === 0 ? (
            <p className="text-body text-muted">Aucun parrainage.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.mentorships.map((m) => (
                <li key={m.id} className="flex flex-col gap-0.5 py-3">
                  <span className="text-body text-ink">
                    {m.role === "mentee" ? "Parrainé(e) par " : "Parraine "}
                    {m.otherName} <Mono>{m.otherRef}</Mono>
                  </span>
                  <span className="text-small text-ink-2">
                    Depuis le <Mono>{formatDate(m.startDate)}</Mono>
                    {m.endDate && (
                      <>
                        {" "}
                        · fin le <Mono>{formatDate(m.endDate)}</Mono>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function DocumentsTab({
  actor,
  header,
  facts,
  day,
}: {
  actor: Actor;
  header: PersonHeader;
  facts: PersonFacts;
  day: Date;
}) {
  const documents = await listPersonDocuments(getDb(), actor, header.person.id, facts);
  return (
    <DocumentsPanel
      personId={header.person.id}
      canUpload={header.permissions.uploadDocuments}
      documents={documents.map((d) => ({
        id: d.id,
        kind: d.kind,
        fileName: d.fileName,
        sizeBytes: d.sizeBytes,
        fileMissing: d.fileMissing,
        createdAt: d.createdAt,
        uploadedBy: d.uploadedBy,
        archivedAt: d.archivedAt,
        deadline: {
          value: classifyDeadline(d.expiresAt, day, header.alertDays),
          date: d.expiresAt,
        },
      }))}
    />
  );
}

async function IntegrationTabView({
  actor,
  header,
  facts,
  day,
}: {
  actor: Actor;
  header: PersonHeader;
  facts: PersonFacts;
  day: Date;
}) {
  const db = getDb();
  const [tab, dossier] = await Promise.all([
    integrationTab(db, actor, header.person.id, facts, day),
    can(actor, "dossier.manage", { person: facts }).allowed
      ? dossierBlock(db, actor, header.person.id, facts)
      : Promise.resolve(null),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <IntegrationPanel
        personId={header.person.id}
        tab={tab}
        today={day.toISOString().slice(0, 10)}
        defaultFollowUpAt={defaultFollowUp(day, tab.followUpDays).toISOString().slice(0, 10)}
      />
      {dossier && (
        <DossierBlock personId={header.person.id} personRef={header.person.ref} block={dossier} />
      )}
    </div>
  );
}

async function HistoryTab({
  actor,
  header,
  facts,
}: {
  actor: Actor;
  header: PersonHeader;
  facts: PersonFacts;
}) {
  const events = await timelineOf(getDb(), actor, header.person.id, facts);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Historique</CardTitle>
      </CardHeader>
      <CardContent>
        <TimelineView events={events} />
      </CardContent>
    </Card>
  );
}

/**
 * Person page. 404 for an unknown person or one the actor cannot even see
 * in the directory (a candidate for ACTION); 403 when visible but out of
 * scope. Only the active tab is loaded. Nothing sensitive is rendered here.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const actor = await requirePageAccess("person.directory.read");
  const { ref } = await params;
  const lookup = await lookupPerson(getDb(), actor, ref);
  if (lookup.status === "notFound") notFound();
  if (lookup.status === "forbidden") forbidden();
  const day = toParisDay();
  if (lookup.access === "trainings") {
    // FORMAT: header reduced to the directory fields, Formations tab only.
    const reduced = await personReducedHeader(getDb(), actor, lookup.personId, lookup.facts);
    return (
      <>
        <ReducedPersonHeader header={reduced} />
        <div className="mb-6">
          <TabNav
            tabs={[
              {
                key: "formations",
                label: "Formations",
                href: `/benevoles/${reduced.person.ref}?onglet=formations`,
              },
            ]}
            active="formations"
            label="Sections de la fiche"
          />
        </div>
        <TrainingsTab
          actor={actor}
          header={{ person: { id: reduced.person.id }, alertDays: reduced.alertDays }}
          facts={lookup.facts}
          day={day}
        />
      </>
    );
  }
  const header = await personHeader(getDb(), actor, lookup.personId, lookup.facts, day);
  const tabs = allowedTabs(header);
  const requested = (await searchParams).onglet;
  // A candidate's page opens on « Intégration » when it is allowed.
  const fallback: TabKey =
    header.person.status === "CANDIDATE" && tabs.includes("integration") ? "integration" : "apercu";
  const active: TabKey =
    typeof requested === "string" && (tabs as string[]).includes(requested)
      ? (requested as TabKey)
      : fallback;
  const links: TabLink[] = TABS.filter((t) => tabs.includes(t.key)).map((t) => ({
    key: t.key,
    label: t.label,
    // Explicit even for « Aperçu »: a candidate's page opens on « Intégration » by default.
    href: `/benevoles/${header.person.ref}?onglet=${t.key}`,
  }));
  const props = { actor, header, facts: lookup.facts, day };
  return (
    <>
      <Header header={header} day={day} />
      <div className="mb-6">
        <TabNav tabs={links} active={active} label="Sections de la fiche" />
      </div>
      {active === "apercu" && <OverviewTab {...props} />}
      {active === "integration" && <IntegrationTabView {...props} />}
      {active === "formations" && <TrainingsTab {...props} />}
      {active === "fonctions" && <AppointmentsTab {...props} />}
      {active === "suivi" && <FollowUpTab {...props} />}
      {active === "documents" && <DocumentsTab {...props} />}
      {active === "historique" && <HistoryTab {...props} />}
    </>
  );
}
