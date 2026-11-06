import { z } from "zod";
import { NIVOL_EXAMPLE, normalizeNivol } from "./nivol";
import { parsePhone } from "./phone";

/**
 * Zod schemas of the person page forms. Client-safe: the same schema
 * validates on the server (`defineAction`) and gives the field-by-field
 * French messages shown under each field.
 */

const MAX_TEXT = 200;

/** Optional text: trimmed, empty → null. */
const optionalText = (max = MAX_TEXT) =>
  z
    .string()
    .max(max, `${String(max)} caractères au maximum.`)
    .optional()
    .nullable()
    .transform((v) => {
      const t = (v ?? "").trim();
      return t === "" ? null : t;
    });

const requiredText = (label: string, max = 100) =>
  z
    .string({ error: `${label} est obligatoire.` })
    .trim()
    .min(1, `${label} est obligatoire.`)
    .max(max, `${String(max)} caractères au maximum.`);

/** Optional e-mail: empty → null, lower case. */
export const optionalEmail = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ?? "").trim().toLowerCase())
  .refine((v) => v === "" || z.email().safeParse(v).success, "Adresse e-mail invalide.")
  .transform((v) => (v === "" ? null : v));

/**
 * Optional phone: normalised to 10 digits (`0612345678`). A foreign number
 * starting with `+` (8 to 15 digits) is kept as typed.
 */
export const optionalPhone = z
  .string()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    const raw = (v ?? "").trim();
    if (raw === "") return null;
    const parsed = parsePhone(raw);
    if (parsed.normalized) return parsed.value;
    const digits = raw.replace(/[\s.\-()]/g, "");
    if (/^\+\d{8,15}$/.test(digits)) return digits;
    ctx.addIssue({
      code: "custom",
      message: "Numéro invalide : 10 chiffres attendus (ex. 06 12 34 56 78).",
    });
    return z.NEVER;
  });

/** `AAAA-MM-JJ` (date input) → calendar day at 00:00 UTC. */
export const isoDay = z
  .string({ error: "Date obligatoire." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")
  .transform((v, ctx) => {
    const [y, m, d] = v.split("-").map(Number);
    const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
    if (date.getUTCDate() !== d) {
      ctx.addIssue({ code: "custom", message: "Date invalide." });
      return z.NEVER;
    }
    return date;
  });

const optionalIsoDay = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ?? "").trim())
  .pipe(z.union([z.literal("").transform(() => null), isoDay]));

const personId = z.string().min(1).max(40);

export const CIVILITIES = ["MME", "M"] as const;

/** Identity and contact (`person.update`). The NIVOL and the CRF e-mail are not editable here. */
export const identitySchema = z.object({
  personId,
  civility: z
    .enum([...CIVILITIES, ""])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  firstName: requiredText("Le prénom"),
  lastName: requiredText("Le nom"),
  birthName: optionalText(100),
  usageName: optionalText(100),
  email: optionalEmail,
  phone: optionalPhone,
  proEmail: optionalEmail,
  proPhone: optionalPhone,
  profession: optionalText(),
  sector: optionalText(),
  company: optionalText(),
  notes: optionalText(4000),
  /** « Ne pas recevoir les messages d'anniversaire » (step 12). */
  greetingOptOut: z.boolean().default(false),
});
export type IdentityInput = z.input<typeof identitySchema>;

export const STATUS_CHOICES = ["ACTIVE", "PAUSED", "SUSPENDED", "INACTIVE", "LEFT"] as const;
export const LEFT_REASONS = [
  "MOVED",
  "AVAILABILITY",
  "PERSONAL",
  "TRANSFER",
  "EXCLUDED",
  "DECEASED",
  "OTHER",
] as const;

/** Status change (`person.status.change`). « Candidat » belongs to step 6. */
export const statusChangeSchema = z
  .object({
    personId,
    status: z.enum(STATUS_CHOICES, { error: "Statut invalide." }),
    leftAt: optionalIsoDay,
    leftReason: z
      .enum([...LEFT_REASONS, ""])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    leftComment: optionalText(1000),
    /** Pause (step 11): start (default today), planned return, short reason. */
    pausedAt: optionalIsoDay,
    pauseUntil: optionalIsoDay,
    pauseReason: optionalText(200),
    /** Departure: end the current appointments and mentorships (checked by default). */
    endAppointments: z.boolean().optional().default(true),
    endMentorships: z.boolean().optional().default(true),
    /** Return of a former volunteer (LEFT → ACTIVE), or any change: a reason for the history. */
    reason: optionalText(500),
  })
  .superRefine((value, ctx) => {
    if (value.pausedAt && value.pauseUntil && value.pauseUntil < value.pausedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["pauseUntil"],
        message: "La reprise prévue est avant le début de la pause.",
      });
    }
    if (value.status !== "LEFT") return;
    if (!value.leftAt) {
      ctx.addIssue({
        code: "custom",
        path: ["leftAt"],
        message: "La date de départ est obligatoire.",
      });
    }
    if (!value.leftReason) {
      ctx.addIssue({
        code: "custom",
        path: ["leftReason"],
        message: "Le motif de départ est obligatoire.",
      });
    }
  });
export type StatusChangeInput = z.input<typeof statusChangeSchema>;

/** NIVOL correction (`person.nivol.correct`, TOPAZE), with a mandatory reason. */
export const nivolCorrectionSchema = z.object({
  personId,
  nivol: z.string({ error: "Le NIVOL est obligatoire." }).transform((v, ctx) => {
    const nivol = normalizeNivol(v);
    if (!nivol) {
      ctx.addIssue({
        code: "custom",
        message: `11 chiffres suivis d'une lettre (ex. ${NIVOL_EXAMPLE}).`,
      });
      return z.NEVER;
    }
    return nivol;
  }),
  reason: requiredText("Le motif", 500),
});
export type NivolCorrectionInput = z.input<typeof nivolCorrectionSchema>;

/** One item of the person's lists (`person.update`). `id` absent → creation. */
export const personListItemSchema = z.discriminatedUnion("list", [
  z.object({
    list: z.literal("annex"),
    personId,
    id: z.string().max(40).optional(),
    code: requiredText("Le code", 40).transform((v) => v.toUpperCase().replace(/\s+/g, "_")),
    label: optionalText(),
    validUntil: optionalIsoDay,
  }),
  z.object({
    list: z.literal("skill"),
    personId,
    id: z.string().max(40).optional(),
    label: requiredText("La compétence"),
    level: z.enum(["BEGINNER", "CONFIRMED", "EXPERT"], { error: "Niveau invalide." }),
  }),
  z.object({
    list: z.literal("language"),
    personId,
    id: z.string().max(40).optional(),
    label: requiredText("La langue"),
    level: z.enum(["NOTIONS", "FLUENT", "BILINGUAL"], { error: "Niveau invalide." }),
  }),
  z.object({
    list: z.literal("license"),
    personId,
    id: z.string().max(40).optional(),
    category: requiredText("La catégorie", 10).transform((v) => v.toUpperCase()),
  }),
]);
export type PersonListItemInput = z.input<typeof personListItemSchema>;

export const archiveListItemSchema = z.object({
  personId,
  list: z.enum(["annex", "skill", "language", "license"]),
  id: z.string().min(1).max(40),
});
