import { createHash, randomBytes } from "node:crypto";
import { fakerFR as faker } from "@faker-js/faker";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import type {
  CandidacyStage,
  Civility,
  LeftReason,
  PersonStatus,
  Profile,
  TrainingResult,
} from "../../src/generated/prisma/enums";
import { toParisDay } from "../../src/lib/dates";
import { DEFAULT_GAIA_CHECKLIST } from "../../src/lib/gaia";
import { documentFileName } from "../../src/lib/fileNames";
import { DOSSIER_SCHEMA_VERSION, type DossierDraft } from "../../src/lib/dossierSchema";
import { computeExpiresAt } from "../../src/server/reference";
import { FINAL_MAIL_DEFAULT } from "../../src/server/settings";
import { REFERENCE_ITEMS } from "./referenceData";
import { AUTOMATION_DEFAULTS, AUTOMATION_KEYS } from "../../src/server/automationSettings";
import { DEFAULT_REMINDER_RULES } from "../../src/server/reminders/defaults";

/**
 * Synthetic seed. 100 % invented people, marked « Donnée fictive (seed) ».
 *
 * - deterministic: fixed faker seed, everything is built in memory first;
 * - idempotent: every row has a stable id (`seed_…`) and is created once, then
 *   updated on later runs — counts never change;
 * - writes no file: documents point to `seed/…` keys flagged `fileMissing`.
 */

export const SEED_MARK = "Donnée fictive (seed)";

/**
 * Draft of the GDPR notice of the online file. **To be validated by the DPO**
 * before any real use; TOPAZE will edit it (setting RGPD_NOTICE).
 */
export const RGPD_NOTICE_DRAFT = [
  "BROUILLON — à faire valider par le DPO avant toute utilisation réelle.",
  "",
  "La Croix-Rouge française (unité locale) traite les informations de ce dossier pour gérer votre engagement bénévole : intégration, formations, missions et suivi. Ce traitement repose sur votre engagement auprès de l'association.",
  "",
  "Les données sont réservées aux responsables de l'unité locale qui en ont besoin, selon leur rôle. Les données sensibles (naissance, adresse, personnes à prévenir) sont protégées et chaque consultation est enregistrée. Elles ne sont ni vendues ni cédées.",
  "",
  "Elles sont conservées pendant votre engagement, puis 5 ans après votre départ, avant d'être supprimées.",
  "",
  "Vous pouvez accéder à vos données, les faire corriger ou supprimer, et vous opposer à leur traitement en écrivant au responsable de l'unité locale ou au délégué à la protection des données de la Croix-Rouge française. Vous pouvez aussi saisir la CNIL.",
].join("\n");
export const FAKER_SEED = 20261104;

/** Volumes announced in the step 2 specification. */
export const SEED_VOLUMES = {
  persons: 62,
  byStatus: { ACTIVE: 42, CANDIDATE: 8, PAUSED: 4, SUSPENDED: 1, INACTIVE: 3, LEFT: 4 },
  minors: 3,
  users: 7,
  referenceItems: REFERENCE_ITEMS.length,
  mentorships: 6,
  /** Active (half-filled draft), revoked, expired, and two used by a submitted dossier. */
  dossierLinks: 5,
} as const satisfies { byStatus: Record<PersonStatus, number> } & Record<string, unknown>;

export interface SeedOptions {
  /** Reference day (00:00 UTC). Default: today in Paris. */
  today?: Date;
  /**
   * Hosted demo (AUTH_DEMO_ON_VERCEL=true, ADR-035 and ADR-042): the database is
   * a demo, fictitious by definition. People created outside the seed (typed by
   * testers) are kept untouched and listed, instead of refusing. Everywhere
   * else the strict refusal applies.
   */
  hostedDemo?: boolean;
}

/** Result of the demo seed: people found outside the seed (hosted demo only). */
export interface SeedDemoResult {
  foreignPeople: { ref: string; createdAt: Date }[];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const addYears = (date: Date, years: number) =>
  utc(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate());
const addMonths = (date: Date, months: number) =>
  utc(date.getUTCFullYear(), date.getUTCMonth() + months, Math.min(date.getUTCDate(), 28));
const pad = (n: number, size = 3) => String(n).padStart(size, "0");
const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Synthetic NIVOL: right format, starts with 000, never a known real one. */
export function seedNivol(index: number): string {
  const letters = "ABCDEFGHJKLMNPRSTUVWXYZ";
  const digits = String((index * 104_729) % 100_000_000).padStart(8, "0");
  return `000${digits}${letters[index % letters.length] ?? "A"}`;
}

/** French numbers reserved for fiction by ARCEP (06 39 98 xx xx), stored as digits only. */
const fictionalMobile = (n: number) =>
  `063998${pad(Math.floor(n / 100) % 100, 2)}${pad(n % 100, 2)}`;

const POSTAL_CITIES = [
  ["78000", "Versailles"],
  ["78150", "Le Chesnay-Rocquencourt"],
  ["78170", "La Celle-Saint-Cloud"],
  ["78220", "Viroflay"],
  ["78350", "Jouy-en-Josas"],
  ["78280", "Guyancourt"],
  ["78960", "Voisins-le-Bretonneux"],
  ["78180", "Montigny-le-Bretonneux"],
] as const;

type WithId<T> = T & { id: string };

/** Returns the value or fails loudly: the seed plan is fixed, a gap is a bug. */
function required<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`Seed : ${what} introuvable.`);
  return value;
}

/** Minimal shape shared by every Prisma model delegate used here. */
interface Delegate {
  findUnique(args: {
    where: { id: string };
    select: { id: true };
  }): PromiseLike<{ id: string } | null>;
  create(args: { data: never }): PromiseLike<unknown>;
  update(args: { where: { id: string }; data: never }): PromiseLike<unknown>;
}

/** Creates rows that do not exist yet, updates the others (by id). */
/** Creates the missing rows only: a value edited by TOPAZE (settings) is never overwritten. */
async function saveMissing<T>(delegate: Delegate, rows: WithId<T>[]): Promise<void> {
  for (const row of rows) {
    const existing = await delegate.findUnique({ where: { id: row.id }, select: { id: true } });
    if (!existing) await delegate.create({ data: row as never });
  }
}

async function save<T>(delegate: Delegate, rows: WithId<T>[]): Promise<void> {
  for (const row of rows) {
    const { id, ...rest } = row;
    const existing = await delegate.findUnique({ where: { id }, select: { id: true } });
    if (existing) await delegate.update({ where: { id }, data: rest as never });
    else await delegate.create({ data: row as never });
  }
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Online dossier of a seed candidate (schemaVersion 1), invented like the
 * rest. `half`: identity and part of the contact details (a draft being
 * typed); `complete`: everything a submission requires (minors included).
 */
export function seedDossierData(
  p: Pick<PersonPlan, "index" | "civility" | "firstName" | "lastName" | "minor">,
  today: Date,
  level: "half" | "complete",
  declaredNivol: string | null = null,
): DossierDraft {
  const [postalCode, city] = POSTAL_CITIES[p.index % POSTAL_CITIES.length] ?? POSTAL_CITIES[0];
  const emailLocal = `${slug(p.firstName)}.${slug(p.lastName)}${p.index}`;
  const birthDate = p.minor
    ? addDays(addYears(today, -15), -45)
    : addDays(addYears(today, -(22 + (p.index % 30))), -((p.index * 13) % 300));
  const identity: DossierDraft["identity"] = {
    civility: p.civility,
    lastName: p.lastName,
    firstName: p.firstName,
    birthDate: isoDay(birthDate),
    birthCity: "Versailles",
    birthDepartment: "78",
    birthCountry: "France",
  };
  const contact: DossierDraft["contact"] = {
    street: `${String(p.index)} rue des Exemples`,
    postalCode,
    city,
    country: "France",
    phone: fictionalMobile(p.index),
    email: `${emailLocal}@exemple.test`,
  };
  if (level === "half") {
    return { identity, contact: { phone: contact.phone, email: contact.email } };
  }
  return {
    identity,
    contact,
    crf: {
      alreadyVolunteer: false,
      hasNivol: declaredNivol !== null,
      ...(declaredNivol ? { nivol: declaredNivol } : {}),
      hasCrfEmail: false,
      activities: ["Secourisme (postes de secours)", "Formation grand public"],
    },
    emergency: {
      civility: "MME",
      lastName: p.lastName,
      firstName: "Dominique",
      relationship: p.minor ? "Mère" : "Sœur",
      phone1: fictionalMobile(7000 + p.index),
      email: `dominique.${slug(p.lastName)}${p.index}@exemple.test`,
    },
    profile: {
      profession: p.minor ? "Lycéen" : "Comptable",
      sector: p.minor ? "Étudiant" : "Services",
      skills: [{ label: "Informatique", level: "CONFIRMED" }],
      languages: [{ label: "Anglais", level: "FLUENT" }],
      diplomas: ["PSC1 (autre organisme)"],
      licenses: p.minor ? [] : ["B"],
    },
    ...(p.minor
      ? {
          guardian: {
            lastName: p.lastName,
            firstName: "Dominique",
            quality: "Mère",
            phone: fictionalMobile(7000 + p.index),
            email: `dominique.${slug(p.lastName)}${String(p.index)}@exemple.test`,
          },
        }
      : {}),
    consent: { rgpd: true },
    structure: "Unité locale de Versailles",
  };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

interface PersonPlan {
  index: number;
  id: string;
  status: PersonStatus;
  civility: Civility;
  firstName: string;
  lastName: string;
  minor: boolean;
  stage?: CandidacyStage;
  recentlyIntegrated: boolean;
  nivol: string | null;
  legacyImport: boolean;
  /**
   * Step 7: a candidate whose online dossier is submitted and waiting for the
   * review. Binivol only knows what was given at the first contact.
   */
  dossierSubmitted: boolean;
}

const CANDIDATE_STAGES: CandidacyStage[] = [
  "FIRST_CONTACT",
  "MEETING",
  "CONFIRMED",
  "FILE",
  "GAIA",
  "ABANDONED",
  // Step 7: two submitted dossiers to review, an adult and a minor of 15.
  "FILE",
  "FILE",
];
const LEFT_REASONS: LeftReason[] = ["MOVED", "AVAILABILITY", "TRANSFER", "PERSONAL"];
const STAGE_PATH: CandidacyStage[] = [
  "FIRST_CONTACT",
  "MEETING",
  "CONFIRMED",
  "FILE",
  "GAIA",
  "DONE",
];

export const USERS: { key: string; name: string; profiles: Profile[] }[] = [
  { key: "topaze", name: "Alex Démo", profiles: ["TOPAZE"] },
  { key: "action", name: "Camille Démo", profiles: ["ACTION"] },
  { key: "laser", name: "Sacha Démo", profiles: ["LASER"] },
  { key: "format", name: "Noa Démo", profiles: ["FORMAT"] },
  { key: "format-gp", name: "Lou Démo", profiles: ["FORMAT_GP"] },
  { key: "diamant", name: "Maé Démo", profiles: ["DIAMANT"] },
  { key: "format-diamant", name: "Eden Démo", profiles: ["FORMAT", "DIAMANT"] },
];
const userId = (key: string) => `seed_user_${key}`;
export const seedUserEmail = (key: string) => `demo.${key}@binivol.test`;

function planPersons(): PersonPlan[] {
  const statuses: PersonStatus[] = [
    ...Array<PersonStatus>(42).fill("ACTIVE"),
    ...Array<PersonStatus>(4).fill("PAUSED"),
    "SUSPENDED",
    ...Array<PersonStatus>(3).fill("INACTIVE"),
    ...Array<PersonStatus>(4).fill("LEFT"),
  ];
  // Volunteers first (older numbers), candidates last (recent contacts).
  const order = [
    ...faker.helpers.shuffle(statuses),
    ...Array<PersonStatus>(CANDIDATE_STAGES.length).fill("CANDIDATE"),
  ];
  let activeSeen = 0;
  let candidateSeen = 0;
  return order.map((status, i) => {
    const index = i + 1;
    const civility: Civility = faker.helpers.arrayElement(["MME", "M"]);
    const sex = civility === "MME" ? "female" : "male";
    const firstName = faker.person.firstName(sex);
    const lastName = faker.person.lastName();
    let minor = false;
    let recentlyIntegrated = false;
    let legacyImport = false;
    let stage: CandidacyStage | undefined;
    let dossierSubmitted = false;
    if (status === "ACTIVE") {
      activeSeen += 1;
      minor = [6, 19, 33].includes(activeSeen);
      recentlyIntegrated = [38, 39, 40, 41, 42].includes(activeSeen);
      legacyImport = activeSeen === 27;
    }
    if (status === "CANDIDATE") {
      stage = CANDIDATE_STAGES[candidateSeen];
      dossierSubmitted = candidateSeen >= 6;
      // The last candidate is 15: legal guardian and parental authorisation.
      minor = candidateSeen === 7;
      candidateSeen += 1;
    }
    const nivol = status === "CANDIDATE" || legacyImport ? null : seedNivol(index);
    return {
      index,
      id: `seed_person_${pad(index)}`,
      status,
      civility,
      firstName,
      lastName,
      minor,
      stage,
      recentlyIntegrated,
      nivol,
      legacyImport,
      dossierSubmitted,
    };
  });
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const refId = (code: string) => `seed_ref_${code.toLowerCase()}`;
const audit = { createdById: null, updatedById: null };

type SeedTx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Thrown when the demo seed would mix fictitious and real people. */
export class RealDataPresentError extends Error {
  constructor(count: number) {
    super(
      `Seed de démonstration refusé : la base contient ${count} personne(s) sans la note « ${SEED_MARK} ». ` +
        "Il ne mélange jamais des données fictives avec de vraies données (utilise une base neuve : pnpm db:fresh).",
    );
    this.name = "RealDataPresentError";
  }
}

const NON_SEED_PERSON = {
  OR: [{ notes: null }, { NOT: { notes: { contains: SEED_MARK } } }],
} satisfies Prisma.PersonWhereInput;

/** Number of people that are not synthetic seed data. */
export async function countNonSeedPersons(db: PrismaClient | SeedTx): Promise<number> {
  return db.person.count({ where: NON_SEED_PERSON });
}

/** People that are not seed data (refs only: nothing personal goes to a log). */
async function listNonSeedPersons(db: PrismaClient | SeedTx) {
  return db.person.findMany({
    where: NON_SEED_PERSON,
    orderBy: { ref: "asc" },
    select: { ref: true, createdAt: true },
  });
}

async function seedBaseIn(tx: SeedTx): Promise<void> {
  // -- Settings -----------------------------------------------------------
  const settingRows: [string, Prisma.InputJsonValue, string][] = [
    ["ALERT_DAYS_BEFORE_EXPIRY", 60, "Nombre de jours avant échéance déclenchant une alerte."],
    ["RETENTION_YEARS_AFTER_LEAVE", 5, "Durée de conservation après le départ, en années (RGPD)."],
    ["BACKUPS_TO_KEEP", 12, "Nombre de sauvegardes conservées."],
    ["DATA_CLASSIFICATION", "C3 CONFIDENTIEL", "Classification des données de l'outil."],
    ["DOSSIER_LINK_DAYS", 7, "Durée de validité, en jours, d'un lien de dossier bénévole."],
    ["UL_NAME", "Unité locale de Versailles", "Structure de rattachement des dossiers bénévoles."],
    ["UL_CITY", "Versailles", "« Fait à » de la charte du bénévolat."],
    [
      "GAIA_CHECKLIST",
      DEFAULT_GAIA_CHECKLIST as unknown as Prisma.InputJsonValue,
      "Liste à cocher de la création dans Gaia (étape 9) : clé, libellé, adhésion seulement.",
    ],
    [
      "FINAL_MAIL_TEXT",
      FINAL_MAIL_DEFAULT,
      "E-mail des documents signés ({prenom}, {pieces}, {ul}).",
    ],
    [
      "RGPD_NOTICE",
      RGPD_NOTICE_DRAFT,
      "Information sur le traitement des données, affichée dans le dossier en ligne (à faire valider par le DPO).",
    ],
    [
      "CANDIDACY_FOLLOW_UP_DAYS",
      7,
      "Délai de relance proposé, en jours, après un passage d'étape d'une candidature.",
    ],
    [
      "NEW_VOLUNTEER_MONTHS",
      12,
      "Ancienneté, en mois, en dessous de laquelle un bénévole relève de DIAMANT.",
    ],
  ];
  // Alerts, reminders and automatic e-mails (step 12): defaults of `automationSettings`.
  for (const field of Object.keys(AUTOMATION_KEYS) as (keyof typeof AUTOMATION_KEYS)[]) {
    const [key, description] = AUTOMATION_KEYS[field];
    settingRows.push([key, AUTOMATION_DEFAULTS[field], description]);
  }
  const settings: WithId<Prisma.SettingUncheckedCreateInput>[] = settingRows.map(
    ([key, value, description]) => ({
      id: `seed_setting_${key.toLowerCase()}`,
      key,
      value,
      description,
      ...audit,
    }),
  );
  // Settings are edited by TOPAZE: a deployment only adds the missing ones.
  await saveMissing(tx.setting, settings);

  // -- Reference list --------------------------------------------------------
  // Edited in the app (step 10, « Référentiel »): a deployment only adds the missing items.
  await saveMissing<Prisma.ReferenceItemUncheckedCreateInput>(
    tx.referenceItem,
    REFERENCE_ITEMS.map((item, i) => ({
      id: refId(item.code),
      code: item.code,
      label: item.label,
      category: item.category,
      kind: item.kind,
      sortOrder: i + 1,
      validityMonths: null,
      expiresEndOfYear: item.expiresEndOfYear,
      forbiddenForMinors: item.forbiddenForMinors,
      perimeters: item.perimeters ?? [],
      managedBy: item.managedBy ?? [],
      active: true,
      note: item.note ?? null,
      ...audit,
    })),
  );
  // The legacy workbook has no prerequisite; the links are edited by TOPAZE
  // and FORMAT (step 10): a deployment never touches them.

  // Reminder rules (step 12): edited by TOPAZE, a deployment only adds the missing ones.
  await saveMissing<Prisma.ReminderRuleUncheckedCreateInput>(
    tx.reminderRule,
    DEFAULT_REMINDER_RULES.map((r) => ({ ...r, ...audit })),
  );
}

/**
 * Base seed — **the only seed allowed in production**: reference list,
 * settings and default reminder rules. No person, no account. Idempotent.
 */
export async function seedBase(db: PrismaClient): Promise<void> {
  await db.$transaction((tx) => seedBaseIn(tx), { timeout: 60_000, maxWait: 20_000 });
}

/**
 * Demo seed: runs the base seed, then the demo accounts and the 60 fictitious
 * people. Safe to run again: it only creates what is missing and refreshes the
 * rest, in one transaction. Refuses a database that holds any non-seed person.
 */
export async function seedDemo(
  db: PrismaClient,
  options: SeedOptions = {},
): Promise<SeedDemoResult> {
  faker.seed(FAKER_SEED);
  const today = options.today ?? toParisDay();
  const year = today.getUTCFullYear();
  const people = planPersons();
  const byCode = new Map(REFERENCE_ITEMS.map((item) => [item.code, item]));
  const expires = (code: string, date: Date | null) => {
    const item = byCode.get(code);
    return computeExpiresAt(
      {
        validityMonths: null,
        expiresEndOfYear: item?.expiresEndOfYear ?? false,
      },
      date,
    );
  };

  const hosted = options.hostedDemo === true;
  const realPeople = await countNonSeedPersons(db);
  if (realPeople > 0 && !hosted) throw new RealDataPresentError(realPeople);
  const foreignPeople = hosted ? await listNonSeedPersons(db) : [];

  await db.$transaction(
    async (tx) => {
      if (!hosted && (await countNonSeedPersons(tx)) > 0)
        throw new RealDataPresentError(await countNonSeedPersons(tx));
      await seedBaseIn(tx);

      // -- Users ----------------------------------------------------------------
      await save<Prisma.UserUncheckedCreateInput>(
        tx.user,
        USERS.map((u) => ({
          id: userId(u.key),
          email: seedUserEmail(u.key),
          name: u.name,
          active: true,
          ...audit,
        })),
      );
      await save<Prisma.UserProfileUncheckedCreateInput>(
        tx.userProfile,
        USERS.flatMap((u) =>
          u.profiles.map((profile) => ({
            id: `seed_up_${u.key}_${profile.toLowerCase()}`,
            userId: userId(u.key),
            profile,
          })),
        ),
      );

      // -- Training sessions ------------------------------------------------------
      const sessions: WithId<Prisma.TrainingSessionUncheckedCreateInput>[] = [
        {
          id: "seed_session_pse",
          referenceId: refId("PSE"),
          startDate: addDays(today, 21),
          endDate: addDays(today, 24),
          place: "Locaux de l'unité locale, Versailles",
          capacity: 10,
        },
        {
          id: "seed_session_fcpse",
          referenceId: refId("FCPSE"),
          startDate: addDays(today, 14),
          endDate: addDays(today, 14),
          place: "Locaux de l'unité locale, Versailles",
          capacity: 12,
        },
        {
          id: "seed_session_tcau",
          referenceId: refId("TCAU"),
          startDate: addDays(today, 45),
          endDate: addDays(today, 46),
          place: "Délégation territoriale des Yvelines",
          capacity: 8,
        },
        {
          id: "seed_session_psc",
          referenceId: refId("PSC"),
          startDate: addDays(today, -30),
          endDate: addDays(today, -30),
          place: "Locaux de l'unité locale, Versailles",
          capacity: 10,
        },
        {
          id: "seed_session_fpse",
          referenceId: refId("FPSE"),
          startDate: addDays(today, 60),
          endDate: addDays(today, 64),
          place: "Délégation territoriale des Yvelines",
          capacity: 6,
          cancelledAt: addDays(today, -3),
          cancelledById: userId("format"),
          cancelReason: "Formateur indisponible (fictif).",
        },
      ].map((s, i) => ({
        ...s,
        pegassUrl: `https://pegass.exemple.test/sessions/seed-${i + 1}`,
        ...audit,
      }));
      await save(tx.trainingSession, sessions);

      // -- People -------------------------------------------------------------------
      const persons: WithId<Prisma.PersonUncheckedCreateInput>[] = [];
      const sensitive: WithId<Prisma.PersonSensitiveUncheckedCreateInput>[] = [];
      const contacts: WithId<Prisma.EmergencyContactUncheckedCreateInput>[] = [];
      const skills: WithId<Prisma.PersonSkillUncheckedCreateInput>[] = [];
      const languages: WithId<Prisma.PersonLanguageUncheckedCreateInput>[] = [];
      const licenses: WithId<Prisma.PersonLicenseUncheckedCreateInput>[] = [];
      const diplomas: WithId<Prisma.PersonDeclaredDiplomaUncheckedCreateInput>[] = [];
      const wished: WithId<Prisma.PersonWishedActivityUncheckedCreateInput>[] = [];
      const annexes: WithId<Prisma.PersonAnnexUncheckedCreateInput>[] = [];
      const records: WithId<Prisma.TrainingRecordUncheckedCreateInput>[] = [];
      const documents: WithId<Prisma.DocumentUncheckedCreateInput>[] = [];

      const record = (
        p: PersonPlan,
        code: string,
        date: Date | null,
        result: TrainingResult = "PASSED",
        extra: Partial<Prisma.TrainingRecordUncheckedCreateInput> = {},
      ) => {
        records.push({
          id: `seed_tr_${pad(p.index)}_${code.toLowerCase()}${extra.sessionId ? "_reg" : ""}`,
          personId: p.id,
          referenceId: refId(code),
          date,
          result,
          expiresAt: result === "PASSED" ? expires(code, date) : null,
          place: date ? "Unité locale de Versailles" : null,
          comment: date ? null : "Date inconnue (reprise de l'ancien classeur, fictif).",
          ...audit,
          ...extra,
        });
      };
      const doc = (
        p: PersonPlan,
        kind: Prisma.DocumentUncheckedCreateInput["kind"],
        copy: Prisma.DocumentUncheckedCreateInput["copy"],
        extra: { fileName?: string; submissionId?: string; suffix?: string } = {},
      ) => {
        const name = extra.suffix ?? kind.toLowerCase();
        const key = `seed/${p.id}/${name}.pdf`;
        documents.push({
          id: `seed_doc_${pad(p.index)}_${name}`,
          personId: p.id,
          kind,
          copy,
          storageKey: key,
          fileName: extra.fileName ?? `${kind.toLowerCase()}-fictif.pdf`,
          submissionId: extra.submissionId ?? null,
          mimeType: "application/pdf",
          sizeBytes: 0,
          sha256: sha256(key),
          fileMissing: true,
          uploadedById: userId("diamant"),
          ...audit,
        });
      };

      for (const p of people) {
        const isCandidate = p.status === "CANDIDATE";
        const entryDate = isCandidate
          ? null
          : p.recentlyIntegrated
            ? addDays(today, -(30 + p.index))
            : addDays(today, -(400 + p.index * 53));
        const leftIndex = people.filter((x) => x.status === "LEFT").indexOf(p);
        const leftAt = p.status === "LEFT" ? addDays(today, -(60 + leftIndex * 150)) : null;
        const [postalCode, city] =
          POSTAL_CITIES[p.index % POSTAL_CITIES.length] ?? POSTAL_CITIES[0];
        const emailLocal = `${slug(p.firstName)}.${slug(p.lastName)}${p.index}`;
        const birthDate = p.minor
          ? isCandidate
            ? addDays(addYears(today, -15), -45)
            : addDays(addYears(today, -16), -(p.index * 7) % 300)
          : addDays(
              addYears(today, -faker.number.int({ min: 19, max: 68 })),
              -faker.number.int({ min: 0, max: 360 }),
            );

        persons.push({
          id: p.id,
          nivol: p.nivol,
          civility: p.civility,
          firstName: p.firstName,
          lastName: p.lastName,
          birthName: p.civility === "MME" && p.index % 6 === 0 ? faker.person.lastName() : null,
          usageName: null,
          email: `${emailLocal}@exemple.test`,
          phone: fictionalMobile(p.index),
          proEmail: p.index % 5 === 0 ? `${emailLocal}@entreprise.exemple.test` : null,
          proPhone: p.index % 5 === 0 ? `01 99 00 ${pad(p.index % 100, 2)} 00` : null,
          crfEmail: isCandidate ? null : `${emailLocal}@crf.exemple.test`,
          status: p.status,
          entryDate,
          leftAt,
          leftReason: p.status === "LEFT" ? (LEFT_REASONS[leftIndex] ?? "OTHER") : null,
          leftComment: p.status === "LEFT" ? "Départ fictif (seed)." : null,
          isMember: !isCandidate && p.index % 3 !== 0,
          aptitude: isCandidate ? "TO_CHECK" : p.status === "SUSPENDED" ? "WITHDRAWN" : "FIT",
          aptitudeDate: isCandidate ? null : addDays(today, -(p.index * 11)),
          otherAasc: p.index % 9 === 0,
          regularMinorSupervisor: !p.minor && p.index % 8 === 0,
          // Legacy « Formateur »: unknown (null) for most, true for three volunteers.
          isTrainer: isCandidate
            ? null
            : [4, 23, 47].includes(p.index)
              ? true
              : p.index % 10 === 5
                ? false
                : null,
          legacyDriveFolderId: null,
          profession: p.dossierSubmitted ? null : faker.person.jobTitle(),
          sector: p.dossierSubmitted
            ? null
            : faker.helpers.arrayElement([
                "Santé",
                "Éducation",
                "Industrie",
                "Services",
                "Étudiant",
                "Retraité",
                "Fonction publique",
              ]),
          company: !p.dossierSubmitted && p.index % 2 === 0 ? faker.company.name() : null,
          notes: SEED_MARK,
          legacyImport: p.legacyImport,
          archivedAt: null,
          purgeEligibleAt: leftAt ? addYears(leftAt, 5) : null,
          ...audit,
        });

        if (p.dossierSubmitted) {
          // Everything else is in the submitted dossier, waiting for the review.
          if (p.minor) doc(p, "PARENTAL_AUTH", "UL");
          continue;
        }

        const b3Status = isCandidate ? "NOT_REQUESTED" : p.index % 10 === 0 ? "REQUESTED" : "CLEAR";
        sensitive.push({
          id: `seed_ps_${pad(p.index)}`,
          personId: p.id,
          birthDate,
          birthCity: faker.location.city(),
          birthDepartment: faker.helpers.arrayElement(["78", "75", "92", "91", "69", "33", "59"]),
          birthCountry: "France",
          street: faker.location.streetAddress(),
          addressComplement:
            p.index % 7 === 0
              ? `Bâtiment ${faker.string.alpha({ length: 1, casing: "upper" })}`
              : null,
          postalCode,
          city,
          country: "France",
          b3CheckedAt: b3Status === "CLEAR" ? addDays(today, -(30 + p.index * 9)) : null,
          b3Status,
          parentalAuthorization: p.minor,
          parentalAuthorizationDate: p.minor ? addDays(today, -(20 + p.index)) : null,
          ...audit,
        });

        for (let c = 0; c < p.index % 3; c += 1) {
          const civility: Civility = faker.helpers.arrayElement(["MME", "M"]);
          contacts.push({
            id: `seed_ec_${pad(p.index)}_${c + 1}`,
            personId: p.id,
            position: c,
            civility,
            lastName: c === 0 ? p.lastName : faker.person.lastName(),
            firstName: faker.person.firstName(civility === "MME" ? "female" : "male"),
            relationship: p.minor
              ? "Parent"
              : faker.helpers.arrayElement(["Conjoint(e)", "Parent", "Frère ou sœur", "Ami(e)"]),
            street: faker.location.streetAddress(),
            postalCode,
            city,
            country: "France",
            phone1: fictionalMobile(5000 + p.index * 10 + c),
            phone2: c === 0 ? `019900${pad(p.index % 100, 2)}${pad(c + 10, 2)}` : null,
            email: `contact${c + 1}.${emailLocal}@exemple.test`,
            ...audit,
          });
        }

        const skillPool = [
          "Informatique",
          "Logistique",
          "Conduite poids lourd",
          "Communication",
          "Animation",
          "Bricolage",
        ];
        faker.helpers.arrayElements(skillPool, p.index % 3).forEach((label, k) =>
          skills.push({
            id: `seed_skill_${pad(p.index)}_${k + 1}`,
            personId: p.id,
            label,
            level: faker.helpers.arrayElement(["BEGINNER", "CONFIRMED", "EXPERT"]),
            ...audit,
          }),
        );
        const languagePool = [
          "Anglais",
          "Espagnol",
          "Allemand",
          "Arabe",
          "Langue des signes française",
          "Italien",
        ];
        faker.helpers.arrayElements(languagePool, (p.index + 1) % 3).forEach((label, k) =>
          languages.push({
            id: `seed_lang_${pad(p.index)}_${k + 1}`,
            personId: p.id,
            label,
            level: faker.helpers.arrayElement(["NOTIONS", "FLUENT", "BILINGUAL"]),
            ...audit,
          }),
        );
        const licenseCategories = p.minor
          ? []
          : p.index % 10 < 7
            ? ["B", ...(p.index % 6 === 0 ? ["C"] : []), ...(p.index % 9 === 0 ? ["BE"] : [])]
            : [];
        licenseCategories.forEach((category) =>
          licenses.push({
            id: `seed_lic_${pad(p.index)}_${category.toLowerCase()}`,
            personId: p.id,
            category,
            ...audit,
          }),
        );
        if (isCandidate || p.recentlyIntegrated) {
          diplomas.push({
            id: `seed_dip_${pad(p.index)}_1`,
            personId: p.id,
            label: faker.helpers.arrayElement(["PSC1 (autre organisme)", "BAFA", "SST", "BNSSA"]),
            ...audit,
          });
          wished.push({
            id: `seed_wish_act_${pad(p.index)}_1`,
            personId: p.id,
            label: faker.helpers.arrayElement([
              "Postes de secours",
              "Maraudes",
              "Formation grand public",
              "Réseau d'urgence",
            ]),
            ...audit,
          });
        }
        if (!isCandidate && !p.minor && p.index % 6 === 1) {
          annexes.push({
            id: `seed_annex_${pad(p.index)}_vpsp`,
            personId: p.id,
            code: "VPSP",
            label: "Conducteur VPSP",
            validUntil: addDays(today, p.index % 4 === 1 ? 25 : 400),
            ...audit,
          });
        }

        // Trainings (volunteers only).
        if (!isCandidate) {
          const old = addDays(today, -(900 + p.index * 17));
          if (p.index % 5 !== 0) record(p, "PSC", addYears(old, -1));
          if (p.index % 7 === 0) record(p, "PSE", null);
          else record(p, "PSE", old);
          const fcThisYear = utc(year, 1, 1 + (p.index % 25));
          if (p.index % 3 === 0)
            record(
              p,
              "FCPSE",
              fcThisYear.getTime() <= today.getTime()
                ? fcThisYear
                : utc(year - 1, 1, 1 + (p.index % 25)),
            );
          if (p.index % 3 === 1) record(p, "FCPSE", utc(year - 1, 2, 1 + (p.index % 25)));
          if (p.index % 4 === 0) record(p, "OPR", addDays(addMonths(today, -30), p.index % 40));
          if (p.index % 5 === 1 || p.index % 5 === 2) record(p, "TCAU", addDays(old, 120));
          if (p.index % 11 === 0) record(p, "FPSE", addDays(old, 300));
          if (p.index % 13 === 0) record(p, "FPSC", addDays(old, 200));
          if (p.index % 17 === 0) record(p, "GQS", addDays(old, -50), "TO_CONFIRM");
          if (p.status === "ACTIVE" && p.index % 8 === 2) {
            record(p, "FCPSE", null, "REGISTERED", { sessionId: "seed_session_fcpse" });
          }
        }
        if (p.minor) doc(p, "PARENTAL_AUTH", "UL");
        if (!isCandidate && p.index % 12 === 0) doc(p, "B3_ATTESTATION", "UL");
        if (p.stage === "GAIA") {
          // The complete dossier (step 8): the UL copy of the 3 PDF and the proof.
          const name = (suffix: string) => documentFileName(p.lastName, p.firstName, suffix);
          const from = { submissionId: "seed_sub_signed" };
          doc(p, "DOSSIER", "UL", { ...from, fileName: name("Dossier-Bénévole") });
          doc(p, "CHARTE", "UL", { ...from, fileName: name("Charte-du-Bénévolat") });
          doc(p, "APTITUDE", "UL", { ...from, fileName: name("Attestation-d_Aptitude") });
          doc(p, "OTHER", "UL", {
            ...from,
            suffix: "proof",
            fileName: name("Preuve-de-signature"),
          });
        }
      }

      await save(tx.person, persons);
      await save(tx.personSensitive, sensitive);
      await save(tx.emergencyContact, contacts);
      await save(tx.personSkill, skills);
      await save(tx.personLanguage, languages);
      await save(tx.personLicense, licenses);
      await save(tx.personDeclaredDiploma, diplomas);
      await save(tx.personWishedActivity, wished);
      await save(tx.personAnnex, annexes);

      // -- Appointments (adults, active) -----------------------------------------------
      const adults = people.filter(
        (p) => p.status === "ACTIVE" && !p.minor && !p.legacyImport && !p.recentlyIntegrated,
      );
      const appointments: WithId<Prisma.AppointmentUncheckedCreateInput>[] = [];
      const appoint = (
        p: PersonPlan,
        code: string,
        k: number,
        extra: Partial<Prisma.AppointmentUncheckedCreateInput> = {},
      ) => {
        appointments.push({
          id: `seed_app_${pad(p.index)}_${code.toLowerCase()}`,
          personId: p.id,
          referenceId: refId(code),
          startDate: addDays(today, -(200 + k * 45)),
          endDate: null,
          authorizedBy: "DLUS (fictif)",
          decisionRef: `DEC-SEED-${pad(k + 1)}`,
          ...audit,
          ...extra,
        });
      };
      const pick = (n: number) => required(adults[n % adults.length], `adulte ${n}`);
      [0, 1, 2].forEach((n) => {
        const p = pick(n);
        if (!records.some((r) => r.personId === p.id && r.referenceId === refId("F_CI"))) {
          record(p, "F_CI", addDays(today, -(700 + n * 30)));
        }
        appoint(p, "CI", n);
      });
      appoint(pick(0), "CDPE", 3);
      [3, 4, 5].forEach((n, k) => {
        appoint(pick(n), "CHEF_PAPS", 4 + k);
      });
      appoint(pick(6), "CH_TECH", 7);
      appoint(pick(7), "CH_RESEAUX", 8);
      appoint(pick(8), "ASSIST_FORM", 9);
      appoint(pick(9), "ASSIST_FORM", 10);
      appoint(pick(10), "CH_FIXE", 11, {
        startDate: addDays(today, -900),
        endDate: addDays(today, -200),
        comment: "Fonction terminée (fictif).",
      });
      appoint(pick(11), "CHEF_PAPS", 12, {
        cancelledAt: addDays(today, -10),
        cancelledById: userId("action"),
        cancelReason: "Nomination saisie par erreur (fictif).",
      });
      // -- Step 10: one state of each kind ------------------------------------------------
      // A group entry on the past PSC session: four passes and one result still to report.
      [20, 21, 22, 23].forEach((n) => {
        const p = pick(n);
        records.push({
          id: `seed_tr_${pad(p.index)}_psc_group`,
          personId: p.id,
          referenceId: refId("PSC"),
          sessionId: "seed_session_psc",
          date: addDays(today, -30),
          result: "PASSED",
          place: "Locaux de l'unité locale, Versailles",
          comment: "Saisie de groupe (fictif).",
          ...audit,
        });
      });
      records.push({
        id: `seed_tr_${pad(pick(24).index)}_psc_pending`,
        personId: pick(24).id,
        referenceId: refId("PSC"),
        sessionId: "seed_session_psc",
        date: addDays(today, -30),
        result: "REGISTERED",
        comment: "Résultat à reporter (fictif).",
        ...audit,
      });
      // An expiry within 30 days (date set on purpose: no reference has a validity in months).
      records.push({
        id: `seed_tr_${pad(pick(25).index)}_gqs_soon`,
        personId: pick(25).id,
        referenceId: refId("GQS"),
        date: addDays(today, -335),
        result: "PASSED",
        expiresAt: addDays(today, 30),
        comment: "Échéance dans 30 jours (fictif).",
        ...audit,
      });
      // A minor with an imported appointment forbidden to minors: kept, flagged by step 12.
      const activeMinor = people.find((p) => p.status === "ACTIVE" && p.minor);
      if (activeMinor) {
        appointments.push({
          id: `seed_app_${pad(activeMinor.index)}_chef_paps_import`,
          legacyRef: `F-LEGACY-${pad(activeMinor.index)}`,
          personId: activeMinor.id,
          referenceId: refId("CHEF_PAPS"),
          startDate: addDays(today, -120),
          endDate: null,
          authorizedBy: null,
          comment: "Importée de l'ancien classeur : interdite aux mineurs (fictif).",
          ...audit,
        });
      }
      await save(tx.trainingRecord, records);
      await save(tx.appointment, appointments);

      // -- Training wishes ----------------------------------------------------------------
      const candidates = people.filter((p) => p.status === "CANDIDATE");
      const candidateAt = (stage: CandidacyStage) =>
        required(
          candidates.find((c) => c.stage === stage),
          `candidat ${stage}`,
        );
      const wishes: WithId<Prisma.TrainingWishUncheckedCreateInput>[] = [];
      const wish = (
        p: PersonPlan,
        code: string,
        status: Prisma.TrainingWishUncheckedCreateInput["status"],
        extra: Partial<Prisma.TrainingWishUncheckedCreateInput> = {},
      ) =>
        wishes.push({
          id: `seed_tw_${pad(p.index)}_${code.toLowerCase()}_${String(status).toLowerCase()}`,
          personId: p.id,
          referenceId: refId(code),
          status,
          priority: wishes.length % 3,
          ...audit,
          ...extra,
        });
      wish(candidateAt("CONFIRMED"), "PSC", "OPEN");
      wish(candidateAt("FILE"), "PSC", "OPEN");
      const pseless = people.filter(
        (p) =>
          p.status === "ACTIVE" &&
          !records.some((r) => r.personId === p.id && r.referenceId === refId("PSE") && r.date),
      );
      pseless.slice(0, 3).forEach((p) =>
        wish(p, "PSE", "WAITLISTED", {
          sessionId: "seed_session_pse",
          comment: "Session complète, en liste d'attente.",
        }),
      );
      people
        .filter((p) => p.status === "ACTIVE" && p.index % 8 === 2)
        .slice(0, 2)
        .forEach((p) => wish(p, "FCPSE", "SCHEDULED", { sessionId: "seed_session_fcpse" }));
      adults.slice(12, 14).forEach((p) => wish(p, "TCAU", "OPEN"));
      wish(required(adults[14], "adulte 14"), "PSC", "DONE");
      wish(required(adults[15], "adulte 15"), "OPR", "CANCELLED", {
        comment: "Souhait retiré (fictif).",
      });
      await save(tx.trainingWish, wishes);

      // -- Candidacies and events --------------------------------------------------------
      const candidacies: WithId<Prisma.CandidacyUncheckedCreateInput>[] = [];
      const events: WithId<Prisma.CandidacyEventUncheckedCreateInput>[] = [];
      const integrated = people.filter((p) => p.recentlyIntegrated);
      for (const [k, p] of [...candidates, ...integrated].entries()) {
        const stage: CandidacyStage = p.stage ?? "DONE";
        const firstContactAt = addDays(today, -(p.recentlyIntegrated ? 120 + k * 5 : 5 + k * 12));
        const closed = stage === "DONE" || stage === "ABANDONED";
        const candidacyId = `seed_cand_${pad(p.index)}`;
        candidacies.push({
          id: candidacyId,
          personId: p.id,
          stage,
          source: faker.helpers.arrayElement([
            "Site internet",
            "Forum des associations",
            "Bouche-à-oreille",
            "Réseaux sociaux",
          ]),
          interest: faker.helpers.arrayElement([
            "Postes de secours",
            "Urgence et réseau de secours",
            "Formation grand public",
            "Action sociale",
          ]),
          firstContactAt,
          nextAction: closed ? null : "Relancer par téléphone (fictif).",
          // The first-contact candidate is overdue (follow-up date passed).
          followUpAt: closed ? null : addDays(today, stage === "FIRST_CONTACT" ? -3 : 7 + k),
          meetingAt:
            stage === "MEETING" || stage === "CONFIRMED"
              ? new Date(addDays(today, stage === "MEETING" ? 4 : -12).getTime() + 17 * 3_600_000)
              : null,
          ownerId: userId(k % 2 === 0 ? "diamant" : "format-diamant"),
          abandonReason: stage === "ABANDONED" ? "NO_RESPONSE" : null,
          abandonNote: stage === "ABANDONED" ? "Ne donne plus de nouvelles (fictif)." : null,
          // The last integrated person was closed 2 days ago: TOPAZE can still undo it (step 9).
          closedAt: closed
            ? p === integrated.at(-1)
              ? addDays(today, -2)
              : addDays(firstContactAt, stage === "DONE" ? 60 : 20)
            : null,
          // Step 9: the Gaia candidate has half of her checklist ticked.
          gaiaChecklist:
            stage === "GAIA"
              ? {
                  created: {
                    at: addDays(today, -1).toISOString(),
                    byId: userId("diamant"),
                    by: "Maé Démo",
                  },
                  attached: {
                    at: addDays(today, -1).toISOString(),
                    byId: userId("diamant"),
                    by: "Maé Démo",
                  },
                }
              : {},
          ...audit,
        });
        // The MEETING candidate was abandoned, then resumed at MEETING.
        const path =
          stage === "ABANDONED"
            ? ["FIRST_CONTACT", "MEETING", "ABANDONED"]
            : stage === "MEETING"
              ? ["FIRST_CONTACT", "MEETING", "ABANDONED", "MEETING"]
              : STAGE_PATH.slice(0, STAGE_PATH.indexOf(stage) + 1);
        path.forEach((to, e) =>
          events.push({
            id: `${candidacyId}_ev_${e + 1}`,
            candidacyId,
            at: addDays(firstContactAt, e * 10),
            authorId: userId("diamant"),
            fromStage: e === 0 ? null : (path[e - 1] as CandidacyStage),
            toStage: to as CandidacyStage,
            note:
              e === 0
                ? "Premier contact (fictif)."
                : to === "ABANDONED"
                  ? "Ne répond plus (fictif)."
                  : stage === "MEETING" && e === 3
                    ? "Reprise : a rappelé de lui-même (fictif)."
                    : null,
            ...audit,
          }),
        );
      }
      // A person who left, re-engaged: a new open candidacy on her existing page.
      const returning = required(
        people.find((p) => p.status === "LEFT"),
        "personne partie",
      );
      const returnAt = addDays(today, -25);
      candidacies.push({
        id: `seed_cand_reengage_${pad(returning.index)}`,
        personId: returning.id,
        stage: "CONFIRMED",
        source: "Bouche-à-oreille",
        interest: "Postes de secours",
        firstContactAt: returnAt,
        nextAction: "Envoyer le dossier bénévole (fictif).",
        followUpAt: addDays(today, 2),
        ownerId: userId("diamant"),
        notes: "Réengagement d'une ancienne bénévole (fictif).",
        closedAt: null,
        ...audit,
      });
      (["FIRST_CONTACT", "MEETING", "CONFIRMED"] as const).forEach((to, e, all) =>
        events.push({
          id: `seed_cand_reengage_${pad(returning.index)}_ev_${String(e + 1)}`,
          candidacyId: `seed_cand_reengage_${pad(returning.index)}`,
          at: addDays(returnAt, e * 8),
          authorId: userId("diamant"),
          fromStage: e === 0 ? null : (all[e - 1] ?? null),
          toStage: to,
          note: e === 0 ? "Réengagement d'une personne déjà connue (fictif)." : null,
          ...audit,
        }),
      );
      await save(tx.candidacy, candidacies);
      await save(tx.candidacyEvent, events);

      // -- Mentorships and follow-ups ------------------------------------------------------
      const mentees = [
        candidateAt("CONFIRMED"),
        candidateAt("FILE"),
        candidateAt("GAIA"),
        ...integrated.slice(0, 2),
      ];
      await save<Prisma.MentorshipUncheckedCreateInput>(
        tx.mentorship,
        mentees.map((mentee, k) => ({
          id: `seed_mentor_${pad(mentee.index)}`,
          menteeId: mentee.id,
          mentorId: required(adults[20 + k], `parrain ${k}`).id,
          startDate: addDays(today, -(20 + k * 15)),
          endDate: null,
          note: "Parrainage fictif (seed).",
          ...audit,
        })),
      );
      const followUps: WithId<Prisma.FollowUpUncheckedCreateInput>[] = [];
      integrated.forEach((p, k) => {
        followUps.push({
          id: `seed_fu_${pad(p.index)}_3m`,
          personId: p.id,
          kind: "THREE_MONTHS",
          scheduledAt: addDays(today, k < 3 ? -10 - k : 10 + k * 5),
          doneAt: k < 3 ? addDays(today, -8 - k) : null,
          conductedById: k < 3 ? userId("diamant") : null,
          summary: k < 3 ? "Point fictif : intégration qui se passe bien." : null,
          nextDate: k < 3 ? addDays(today, 270) : null,
          ...audit,
        });
      });
      adults.slice(16, 19).forEach((p, k) =>
        followUps.push({
          id: `seed_fu_${pad(p.index)}_annual`,
          personId: p.id,
          kind: "ANNUAL",
          scheduledAt: addDays(today, k === 0 ? -15 : 20 + k * 10),
          doneAt: null,
          ...audit,
        }),
      );
      await save(tx.followUp, followUps);

      // -- Step 11: pauses, departures, mentorship of 13 months, B3 ----------------------
      // A mentorship started 13 months ago: its end is suggested (never imposed).
      const longMentee = integrated[2];
      if (longMentee) {
        await save<Prisma.MentorshipUncheckedCreateInput>(tx.mentorship, [
          {
            id: `seed_mentor_${pad(longMentee.index)}_long`,
            menteeId: longMentee.id,
            mentorId: required(adults[25], "parrain long").id,
            startDate: addDays(today, -395),
            endDate: null,
            note: "Parrainage de 13 mois (fictif).",
            ...audit,
          },
        ]);
      }
      // A paused person whose planned return is past (step 12 will remind it).
      const paused = people.find((p) => p.status === "PAUSED");
      if (paused) {
        await tx.person.update({
          where: { id: paused.id },
          data: {
            pausedAt: addDays(today, -90),
            pauseUntil: addDays(today, -5),
            pauseReason: "Examens (fictif).",
          },
        });
      }
      // A departure 6 years ago: eligible to the purge (step 14).
      const oldLeaver = people.filter((p) => p.status === "LEFT").at(-1);
      if (oldLeaver) {
        const leftAt = addYears(today, -6);
        await tx.person.update({
          where: { id: oldLeaver.id },
          data: { leftAt, purgeEligibleAt: addYears(leftAt, 5) },
        });
      }
      // A regular supervisor of minors without a B3 check this year (last one: last year).
      const supervisor = adults[26];
      if (supervisor) {
        await tx.person.update({
          where: { id: supervisor.id },
          data: { regularMinorSupervisor: true },
        });
        await tx.personSensitive.update({
          where: { personId: supervisor.id },
          data: {
            b3CheckedAt: new Date(Date.UTC(today.getUTCFullYear() - 1, 5, 15)),
            b3Status: "CLEAR",
          },
        });
      }
      // The return of a former volunteer, traced (LEFT → ACTIVE with its reason).
      const returned = adults[27];
      if (returned) {
        await tx.auditLog.createMany({
          skipDuplicates: true,
          data: [
            {
              id: "seed_audit_return_status",
              at: addDays(today, -40),
              actorId: userId("diamant"),
              action: "UPDATE",
              entity: "Person",
              entityId: returned.id,
              field: "status",
              oldValue: "LEFT",
              newValue: "ACTIVE",
            },
            {
              id: "seed_audit_return_reason",
              at: addDays(today, -40),
              actorId: userId("diamant"),
              action: "UPDATE",
              entity: "Person",
              entityId: returned.id,
              field: "statusReason",
              newValue: { kind: "return", reason: "Revient après un déménagement (fictif)." },
            },
          ],
        });
      }

      // -- Online file, signature ----------------------------------------------------------
      const fileCandidate = candidateAt("FILE");
      const gaiaCandidate = candidateAt("GAIA");
      const abandoned = candidateAt("ABANDONED");
      const [adultDossier, minorDossier] = candidates.filter((c) => c.dossierSubmitted);
      const adultFile = required(adultDossier, "candidat au dossier envoyé (majeur)");
      const minorFile = required(minorDossier, "candidat au dossier envoyé (mineur)");
      // The adult declares a NIVOL already held by a volunteer: the review warns.
      const declaredNivol = required(
        people.find((p) => p.status === "ACTIVE" && p.nivol),
        "bénévole avec NIVOL",
      ).nivol;
      const dossierLinks = [
        {
          id: "seed_link_revoked",
          personId: fileCandidate.id,
          mode: "REMOTE" as const,
          createdAt: addDays(today, -9),
          expiresAt: addDays(today, -2),
          usedAt: null,
          revokedAt: addDays(today, -4),
        },
        {
          id: "seed_link_active",
          personId: fileCandidate.id,
          mode: "REMOTE" as const,
          createdAt: addDays(today, -4),
          expiresAt: addDays(today, 3),
          usedAt: null,
          revokedAt: null,
        },
        {
          id: "seed_link_expired",
          personId: abandoned.id,
          mode: "REMOTE" as const,
          createdAt: addDays(today, -12),
          expiresAt: addDays(today, -5),
          usedAt: null,
          revokedAt: null,
        },
        {
          id: "seed_link_adult",
          personId: adultFile.id,
          mode: "REMOTE" as const,
          createdAt: addDays(today, -3),
          expiresAt: addDays(today, 4),
          usedAt: addDays(today, -1),
          revokedAt: null,
        },
        {
          id: "seed_link_minor",
          personId: minorFile.id,
          mode: "ON_SITE" as const,
          createdAt: addDays(today, -2),
          // On site, one day: expired; the guardian signs through a new link or on site.
          expiresAt: addDays(today, -1),
          usedAt: null,
          revokedAt: null,
        },
      ];
      for (const link of dossierLinks) {
        const existing = await tx.dossierLink.findUnique({
          where: { id: link.id },
          select: { id: true },
        });
        const { id, expiresAt, usedAt, revokedAt } = link;
        if (existing)
          await tx.dossierLink.update({ where: { id }, data: { expiresAt, usedAt, revokedAt } });
        // The token is random and immediately discarded: only its hash is stored.
        else
          await tx.dossierLink.create({
            data: {
              ...link,
              tokenHash: sha256(randomBytes(32).toString("base64url")),
              createdById: userId("diamant"),
              updatedById: userId("diamant"),
            },
          });
      }
      await save<Prisma.DossierSubmissionUncheckedCreateInput>(tx.dossierSubmission, [
        {
          id: "seed_sub_draft",
          personId: fileCandidate.id,
          linkId: "seed_link_active",
          status: "DRAFT",
          data: seedDossierData(fileCandidate, today, "half"),
          schemaVersion: DOSSIER_SCHEMA_VERSION,
          ...audit,
        },
        {
          id: "seed_sub_adult",
          personId: adultFile.id,
          linkId: "seed_link_adult",
          // Signed by the volunteer: to countersign.
          status: "SIGNED",
          data: seedDossierData(adultFile, today, "complete", declaredNivol),
          schemaVersion: DOSSIER_SCHEMA_VERSION,
          submittedAt: addDays(today, -1),
          signedAt: addDays(today, -1),
          ...audit,
        },
        {
          id: "seed_sub_minor",
          personId: minorFile.id,
          linkId: "seed_link_minor",
          status: "SUBMITTED",
          data: seedDossierData(minorFile, today, "complete"),
          schemaVersion: DOSSIER_SCHEMA_VERSION,
          submittedAt: addDays(today, -2),
          ...audit,
        },
        {
          id: "seed_sub_signed",
          personId: gaiaCandidate.id,
          linkId: null,
          // Countersigned: complete, documents in the UL copy (fileMissing).
          status: "COMPLETE",
          data: seedDossierData(gaiaCandidate, today, "complete"),
          schemaVersion: DOSSIER_SCHEMA_VERSION,
          submittedAt: addDays(today, -6),
          signedAt: addDays(today, -6),
          completedAt: addDays(today, -5),
          finalMailSentAt: addDays(today, -5),
          ...audit,
        },
      ]);
      await save<Prisma.OtpChallengeUncheckedCreateInput>(tx.otpChallenge, [
        {
          id: "seed_otp_signed",
          submissionId: "seed_sub_signed",
          codeHash: sha256("seed-otp-never-sent"),
          email: `${slug(gaiaCandidate.firstName)}.${slug(gaiaCandidate.lastName)}${gaiaCandidate.index}@exemple.test`,
          expiresAt: addDays(today, -6),
          attempts: 1,
          verifiedAt: addDays(today, -6),
          ...audit,
        },
      ]);
      const gaiaHashes = Object.fromEntries(
        ["Dossier-Bénévole", "Charte-du-Bénévolat", "Attestation-d_Aptitude"].map((suffix) => [
          documentFileName(gaiaCandidate.lastName, gaiaCandidate.firstName, suffix),
          sha256(`seed/${gaiaCandidate.id}/${suffix}`),
        ]),
      );
      await save<Prisma.SignatureUncheckedCreateInput>(tx.signature, [
        {
          id: "seed_sig_volunteer",
          submissionId: "seed_sub_signed",
          signerRole: "VOLUNTEER",
          signerName: `${gaiaCandidate.firstName} ${gaiaCandidate.lastName}`,
          signerQuality: "Bénévole",
          imageKey: null,
          typedName: `${gaiaCandidate.firstName} ${gaiaCandidate.lastName}`,
          method: "OTP_EMAIL",
          verifiedEmail: seedDossierData(gaiaCandidate, today, "complete").contact?.email ?? null,
          signedAt: addDays(today, -6),
          otpChallengeId: "seed_otp_signed",
          userAgent: "Seed/1.0 (fictif)",
          ipHash: sha256("seed-ip"),
          documentHashes: gaiaHashes,
          ...audit,
        },
        {
          id: "seed_sig_crf",
          submissionId: "seed_sub_signed",
          signerRole: "CRF_REPRESENTATIVE",
          signerName: "Maé Démo",
          signerQuality: "DIAMANT · Animation des équipes",
          imageKey: null,
          typedName: "Maé Démo",
          method: "SESSION",
          verifiedEmail: seedUserEmail("diamant"),
          verifiedById: userId("diamant"),
          signedAt: addDays(today, -5),
          documentHashes: gaiaHashes,
          ...audit,
        },
        // Signed by the volunteer, to countersign (typed: no file to read).
        {
          id: "seed_sig_adult",
          submissionId: "seed_sub_adult",
          signerRole: "VOLUNTEER",
          signerName: `${adultFile.firstName} ${adultFile.lastName}`,
          imageKey: null,
          typedName: `${adultFile.firstName} ${adultFile.lastName}`,
          method: "OTP_EMAIL",
          verifiedEmail: seedDossierData(adultFile, today, "complete").contact?.email ?? null,
          signedAt: addDays(today, -1),
          userAgent: "Seed/1.0 (fictif)",
          ipHash: sha256("seed-ip-adult"),
          ...audit,
        },
        // The minor signed on site; her legal guardian has not signed yet.
        {
          id: "seed_sig_minor",
          submissionId: "seed_sub_minor",
          signerRole: "VOLUNTEER",
          signerName: `${minorFile.firstName} ${minorFile.lastName}`,
          imageKey: null,
          typedName: `${minorFile.firstName} ${minorFile.lastName}`,
          method: "IN_PERSON",
          verifiedById: userId("diamant"),
          signedAt: addDays(today, -2),
          userAgent: "Seed/1.0 (fictif)",
          ...audit,
        },
      ]);
      await save(tx.document, documents);
      // The parental authorisation of the minor's dossier became her document.
      const minorAuth = required(
        documents.find((d) => d.personId === minorFile.id && d.kind === "PARENTAL_AUTH"),
        "autorisation parentale du dossier mineur",
      );
      await save<Prisma.DossierAttachmentUncheckedCreateInput>(tx.dossierAttachment, [
        {
          id: "seed_att_minor_parental",
          submissionId: "seed_sub_minor",
          kind: "PARENTAL_AUTH",
          storageKey: minorAuth.storageKey,
          fileName: minorAuth.fileName,
          mimeType: minorAuth.mimeType,
          sizeBytes: minorAuth.sizeBytes,
          sha256: minorAuth.sha256,
          documentId: minorAuth.id,
          ...audit,
        },
      ]);

      // -- Reminder rules and notifications ---------------------------------------------
      const someone = required(
        people.find((p) =>
          records.some(
            (r) =>
              r.personId === p.id &&
              r.referenceId === refId("FCPSE") &&
              r.expiresAt &&
              r.expiresAt >= today,
          ),
        ),
        "personne avec FCPSE valide",
      );
      await save<Prisma.NotificationUncheckedCreateInput>(
        tx.notification,
        [
          {
            id: "seed_notif_1",
            userId: userId("topaze"),
            ruleId: "seed_rule_training_expiring",
            personId: someone.id,
            title: "Formation bientôt échue",
            body: "Une formation continue PSE arrive à échéance au 31/12 (fictif).",
            href: "/formations",
            dedupeKey: `TRAINING_EXPIRING:${someone.id}:FCPSE`,
          },
          {
            id: "seed_notif_2",
            userId: userId("diamant"),
            ruleId: "seed_rule_candidacy_idle",
            personId: candidateAt("MEETING").id,
            title: "Candidature à relancer",
            body: "Aucune action depuis 14 jours (fictif).",
            href: "/candidats",
            dedupeKey: `CANDIDACY_IDLE:${candidateAt("MEETING").id}`,
          },
          {
            id: "seed_notif_3",
            userId: userId("diamant"),
            ruleId: "seed_rule_followup_due",
            personId: integrated[3]?.id ?? null,
            title: "Point à 3 mois à prévoir",
            href: "/rappels",
            dedupeKey: `FOLLOWUP_DUE:${integrated[3]?.id ?? "none"}`,
          },
          {
            id: "seed_notif_4",
            userId: userId("topaze"),
            title: "Bienvenue dans Binivol",
            body: "Toutes les données de cet environnement sont fictives.",
            href: "/",
            dedupeKey: "WELCOME",
            readAt: addDays(today, -1),
          },
        ].map((n) => ({ ...n, ...audit })),
      );

      // -- Logs (append-only: inserted once, never updated) -----------------------------
      await tx.auditLog.createMany({
        skipDuplicates: true,
        data: [
          {
            id: "seed_audit_1",
            at: addDays(today, -30),
            actorLabel: "Import",
            action: "IMPORT",
            entity: "Seed",
            newValue: { persons: SEED_VOLUMES.persons, synthetic: true },
          },
          {
            id: "seed_audit_2",
            at: addDays(today, -10),
            actorId: userId("action"),
            action: "CANCEL",
            entity: "Appointment",
            entityId: `seed_app_${pad(pick(11).index)}_chef_paps`,
            field: "cancelledAt",
            newValue: { reason: "Nomination saisie par erreur (fictif)." },
          },
          {
            id: "seed_audit_3",
            at: addDays(today, -6),
            actorLabel: "Système",
            action: "UPDATE",
            entity: "DossierSubmission",
            entityId: "seed_sub_signed",
            field: "status",
            oldValue: "SUBMITTED",
            newValue: "SIGNED",
          },
        ],
      });
      await tx.accessLog.createMany({
        skipDuplicates: true,
        data: [
          {
            id: "seed_access_1",
            at: addDays(today, -2),
            userId: userId("topaze"),
            personId: people[0]?.id ?? null,
            scope: "SENSITIVE_VIEW",
            context: "Fiche bénévole (fictif)",
          },
          {
            id: "seed_access_2",
            at: addDays(today, -1),
            userId: userId("diamant"),
            personId: gaiaCandidate.id,
            scope: "DOCUMENT_VIEW",
            context: "Dossier signé (fictif)",
          },
        ],
      });
    },
    { timeout: 180_000, maxWait: 20_000 },
  );
  return { foreignPeople };
}

/** Row counts of every table, for the seed report and the tests. */
export async function countRows(db: PrismaClient): Promise<Record<string, number>> {
  const [
    persons,
    personSensitive,
    emergencyContacts,
    skills,
    languages,
    licenses,
    declaredDiplomas,
    wishedActivities,
    annexes,
    users,
    userProfiles,
    referenceItems,
    prerequisites,
    sessions,
    trainingRecords,
    trainingWishes,
    appointments,
    candidacies,
    candidacyEvents,
    mentorships,
    followUps,
    dossierLinks,
    submissions,
    otpChallenges,
    signatures,
    documents,
    reminderRules,
    notifications,
    settings,
    auditLogs,
    accessLogs,
  ] = await Promise.all([
    db.person.count(),
    db.personSensitive.count(),
    db.emergencyContact.count(),
    db.personSkill.count(),
    db.personLanguage.count(),
    db.personLicense.count(),
    db.personDeclaredDiploma.count(),
    db.personWishedActivity.count(),
    db.personAnnex.count(),
    db.user.count(),
    db.userProfile.count(),
    db.referenceItem.count(),
    db.referenceItemPrerequisite.count(),
    db.trainingSession.count(),
    db.trainingRecord.count(),
    db.trainingWish.count(),
    db.appointment.count(),
    db.candidacy.count(),
    db.candidacyEvent.count(),
    db.mentorship.count(),
    db.followUp.count(),
    db.dossierLink.count(),
    db.dossierSubmission.count(),
    db.otpChallenge.count(),
    db.signature.count(),
    db.document.count(),
    db.reminderRule.count(),
    db.notification.count(),
    db.setting.count(),
    db.auditLog.count(),
    db.accessLog.count(),
  ]);
  return {
    users,
    user_profiles: userProfiles,
    persons,
    person_sensitive: personSensitive,
    emergency_contacts: emergencyContacts,
    person_skills: skills,
    person_languages: languages,
    person_licenses: licenses,
    person_declared_diplomas: declaredDiplomas,
    person_wished_activities: wishedActivities,
    person_annexes: annexes,
    reference_items: referenceItems,
    reference_item_prerequisites: prerequisites,
    training_sessions: sessions,
    training_records: trainingRecords,
    training_wishes: trainingWishes,
    appointments,
    candidacies,
    candidacy_events: candidacyEvents,
    mentorships,
    follow_ups: followUps,
    dossier_links: dossierLinks,
    dossier_submissions: submissions,
    otp_challenges: otpChallenges,
    signatures,
    documents,
    reminder_rules: reminderRules,
    notifications,
    settings,
    audit_logs: auditLogs,
    access_logs: accessLogs,
  };
}

/** @deprecated Alias kept for existing callers: the demo seed. */
export const seed = seedDemo;
