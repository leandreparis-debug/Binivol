import { z } from "zod";
import { DocumentKind } from "@/generated/prisma/enums";
import { isoDay } from "@/lib/personForms";

const uploadSchema = z.object({
  personId: z.string().min(1).max(40),
  kind: z.enum(Object.values(DocumentKind) as [DocumentKind, ...DocumentKind[]], {
    error: "Type de document invalide.",
  }),
  expiresAt: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim())
    .pipe(z.union([z.literal("").transform(() => null), isoDay])),
  file: z.instanceof(File, { error: "Choisissez un fichier." }),
});

/** The upload form (FormData) parsed into typed values, errors keyed by field. */
export const uploadFormSchema = z.instanceof(FormData).transform((form, ctx) => {
  const parsed = uploadSchema.safeParse({
    personId: form.get("personId"),
    kind: form.get("kind"),
    expiresAt: form.get("expiresAt") ?? "",
    file: form.get("file"),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
    return z.NEVER;
  }
  return parsed.data;
});
