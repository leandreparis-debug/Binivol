import { z } from "zod";

/*
 * Forms of /admin/reglages (step 12), shared by the action and the tests.
 * Lists are typed as text (comma or line separated) and normalised here.
 */

const PROFILES = ["TOPAZE", "ACTION", "LASER", "FORMAT", "FORMAT_GP", "DIAMANT"] as const;

const codeList = z
  .string()
  .max(500)
  .transform((v) =>
    v
      .split(/[,\n;]/)
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().regex(/^[A-Z0-9_]{1,20}$/, "Code du référentiel invalide.")).max(50));

/** « PSE : OPR, ECG » per line → { PSE: ["OPR", "ECG"] }. */
const companions = z
  .string()
  .max(2000)
  .transform((v, ctx) => {
    const out: Record<string, string[]> = {};
    for (const line of v
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)) {
      const [head, rest] = line.split(":");
      const code = (head ?? "").trim().toUpperCase();
      const required = (rest ?? "")
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      if (!/^[A-Z0-9_]{1,20}$/.test(code) || required.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: `Ligne invalide : « ${line} » (ex. PSE : OPR, ECG).`,
        });
        return z.NEVER;
      }
      out[code] = required;
    }
    return out;
  });

const emails = z
  .string()
  .max(2000)
  .transform((v) =>
    v
      .split(/[,\n;]/)
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.email("Adresse e-mail invalide.")).max(30));

const text = z
  .string()
  .trim()
  .min(10, "Le texte est trop court.")
  .max(2000, "2 000 caractères au plus.")
  .refine((v) => !v.includes("—"), "Pas de tiret cadratin dans les e-mails.");

export const settingsFormSchema = z.discriminatedUnion("section", [
  z.object({
    section: z.literal("alerts"),
    disabled: z.array(z.string().max(40)).max(40),
    coreCodes: codeList,
    companions,
  }),
  z.object({
    section: z.literal("digest"),
    frequency: z.enum(["MONTHLY", "WEEKLY", "OFF"], { error: "Choisissez une fréquence." }),
  }),
  z.object({
    section: z.literal("urgence"),
    codes: codeList,
    recipients: emails,
  }),
  z.object({
    section: z.literal("greetings"),
    enabled: z.boolean(),
    birthdayText: text,
    anniversaryText: text,
  }),
]);

export type SettingsForm = z.infer<typeof settingsFormSchema>;

export const reminderRuleSchema = z.object({
  id: z.string().min(1).max(40),
  active: z.boolean(),
  offsetDays: z.coerce
    .number({ error: "Nombre de jours invalide." })
    .int("Nombre de jours entier.")
    .min(0, "0 jour au moins.")
    .max(730, "730 jours au plus."),
  recipients: z.array(z.enum(PROFILES)).min(1, "Au moins un profil destinataire."),
});
